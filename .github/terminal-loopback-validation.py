import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import pexpect
from playwright.sync_api import sync_playwright


def eventually(check, message, timeout=12):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.1)
    raise AssertionError(message)


def browser_session(browser, url):
    page = browser.new_page()
    output = []

    def receive(payload):
        output.append(payload.decode('utf-8', 'replace') if isinstance(payload, bytes) else payload)

    page.on('websocket', lambda websocket: websocket.on('framereceived', receive))
    page.goto(url, wait_until='domcontentloaded')
    textarea = page.locator('.xterm-helper-textarea')
    textarea.wait_for(state='attached')
    for _ in range(100):
        if output:
            break
        page.wait_for_timeout(100)
    assert output, 'no browser terminal frames received'
    textarea.focus()
    return page, output


def terminal_input(page, command):
    page.keyboard.type(command)
    page.keyboard.press('Enter')


def require_browser_output(page, output, marker):
    for _ in range(100):
        if marker in ''.join(output):
            return
        page.wait_for_timeout(100)
    raise AssertionError(f'browser did not receive {marker}')


def require_loopback_listener(port):
    if sys.platform == 'linux':
        addresses = []
        for name in ('tcp', 'tcp6'):
            for row in Path(f'/proc/net/{name}').read_text().splitlines()[1:]:
                fields = row.split()
                address, local_port = fields[1].split(':')
                if fields[3] == '0A' and int(local_port, 16) == port:
                    addresses.append(address)
        assert addresses == ['0100007F'], addresses
    else:
        output = subprocess.check_output(['lsof', '-nP', '-iTCP:' + str(port), '-sTCP:LISTEN', '-Fn'], text=True)
        addresses = [line for line in output.splitlines() if line.startswith('n')]
        assert addresses == [f'n127.0.0.1:{port}'], addresses


def stop(process):
    if process is not None and process.poll() is None:
        process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=7)
            raise


def main():
    script = str(Path('project/local-web-terminal/terminal.sh').resolve())
    socket_pattern = 'leetcode-web-terminal.*'
    socket_directories = set(Path('/tmp').glob(socket_pattern))
    with socket.socket() as free:
        free.bind(('127.0.0.1', 0))
        port = free.getsockname()[1]
    url = f'http://127.0.0.1:{port}/'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    with tempfile.TemporaryDirectory(prefix='term-test-', dir='/tmp') as tmux_tmp:
        environment = dict(os.environ, SHELL='/bin/sh', TERM='xterm-256color', TMUX_TMPDIR=tmux_tmp, WEB_TERMINAL_PORT=str(port))
        environment.pop('TMUX', None)
        environment['XDG_CONFIG_HOME'] = tmux_tmp
        local_client = None
        service = None

        def start_service():
            return subprocess.Popen([script, 'serve'], env=environment, start_new_session=True)

        def server_ready():
            assert service.poll() is None, f'web terminal exited {service.returncode}'
            try:
                with opener.open(url, timeout=1) as response:
                    return response.status == 200
            except (OSError, urllib.error.URLError):
                return False

        try:
            with socket.socket() as occupied:
                occupied.bind(('127.0.0.1', port))
                occupied.listen()
                service = start_service()
                assert service.wait(timeout=10) != 0, 'occupied port was accepted'
            assert set(Path('/tmp').glob(socket_pattern)) == socket_directories, 'socket directory leaked after collision'
            print('occupied port rejected and startup resources cleaned', flush=True)

            service = start_service()
            eventually(server_ready, 'web terminal did not become ready')
            require_loopback_listener(port)
            print('TCP listener is 127.0.0.1 only', flush=True)

            with sync_playwright() as runner:
                browser = runner.chromium.launch(headless=True)
                page, output = browser_session(browser, url)
                local_client = pexpect.spawn(script, ['attach'], env=environment, encoding='utf-8', timeout=12, dimensions=(24, 100))
                terminal_input(page, "printf '%s%s\\n' TERM_TEST_ BROWSER")
                local_client.expect_exact('TERM_TEST_BROWSER')
                require_browser_output(page, output, 'TERM_TEST_BROWSER')

                local_client.sendline("survivor=alive; printf '%s%s\\n' TERM_TEST_ NATIVE")
                local_client.expect_exact('TERM_TEST_NATIVE')
                require_browser_output(page, output, 'TERM_TEST_NATIVE')
                print('browser and native terminal share input and output in both directions', flush=True)

                local_client.send('\x02d')
                local_client.expect(pexpect.EOF)
                stop(service)
                page.close()
                assert set(Path('/tmp').glob(socket_pattern)) == socket_directories, 'socket directory leaked after stop'

                service = start_service()
                eventually(server_ready, 'web terminal did not restart')
                page, output = browser_session(browser, url)
                terminal_input(page, "printf '%s%s\\n' TERM_TEST_PERSISTED_ \"$survivor\"")
                require_browser_output(page, output, 'TERM_TEST_PERSISTED_alive')
                print('tmux shell state survives stopping and restarting the web service', flush=True)
                browser.close()
        finally:
            if local_client is not None:
                local_client.close(force=True)
            stop(service)
            subprocess.run(['tmux', '-L', 'leetcode-web-terminal', 'kill-server'], env=environment, capture_output=True, timeout=6)
        assert set(Path('/tmp').glob(socket_pattern)) == socket_directories, 'socket directory leaked on final stop'


if __name__ == '__main__':
    main()
