import os
import socket
import subprocess
import threading
import time
import urllib.request

from playwright.sync_api import sync_playwright


GUEST = ['wsl.exe', '-d', 'Ubuntu-24.04', '-u', 'terminaltest', '--exec']


def guest(*args, **kwargs):
    return subprocess.check_output([*GUEST, *args], timeout=15, **kwargs)


def eventually(check, message, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.15)
    raise AssertionError(message)


def browser_terminal(browser, url):
    page = browser.new_page()
    frames = []

    def receive(payload):
        message = payload.decode('utf-8', 'replace') if isinstance(payload, bytes) else payload
        if message.startswith('0'):
            frames.append(message[1:])

    page.on('websocket', lambda ws: ws.on('framereceived', receive))
    page.goto(url, wait_until='domcontentloaded')
    textarea = page.locator('.xterm-helper-textarea')
    textarea.wait_for(state='attached')
    for _ in range(120):
        if frames:
            break
        page.wait_for_timeout(100)
    assert frames, 'no frames received from the WSL terminal'
    textarea.focus()
    return page, frames


def browser_input(page, command):
    page.keyboard.type(command)
    page.keyboard.press('Enter')


def expect_frames(page, frames, marker):
    for _ in range(120):
        if marker in ''.join(frames):
            return
        page.wait_for_timeout(100)
    raise AssertionError(f'Windows browser did not receive {marker}')


def check_guest_listener(port):
    listeners = []
    for name in ('tcp', 'tcp6'):
        for row in guest('cat', f'/proc/net/{name}').decode().splitlines()[1:]:
            fields = row.split()
            address, number = fields[1].split(':')
            if fields[3] == '0A' and int(number, 16) == port:
                listeners.append(address)
    assert listeners == ['0100007F'], listeners


def main():
    code = subprocess.check_output(['git', 'show', 'HEAD:project/local-web-terminal/terminal.sh'])
    with socket.socket() as available:
        available.bind(('127.0.0.1', 0))
        port = available.getsockname()[1]
    assert os.name == 'nt', os.name
    url = f'http://127.0.0.1:{port}/'
    browser_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    root = guest('mktemp', '-d', '/tmp/term-wsl.XXXXXXXX').decode().strip()
    script = f'{root}/terminal.sh'
    pidfile = f'{root}/serve.pid'
    guest('tee', script, input=code)
    env = ['/usr/bin/env', 'TERM=xterm-256color', 'SHELL=/bin/sh', f'TMUX_TMPDIR={root}', f'WEB_TERMINAL_PORT={port}']
    service = None
    attached = None

    def start():
        return subprocess.Popen([*GUEST, *env, 'sh', '-c', 'echo "$$" > "$1"; exec sh "$2" serve', 'sh', pidfile, script])

    def ready():
        assert service.poll() is None, f'WSL terminal launcher exited {service.returncode}'
        try:
            with browser_http.open(url, timeout=1) as response:
                return response.status == 200
        except OSError:
            return False

    def stop():
        if service is not None and service.poll() is None:
            guest('sh', '-c', 'kill -TERM "$(cat "$1")"', 'sh', pidfile)
            service.wait(timeout=10)

    try:
        service = start()
        eventually(ready, 'Windows localhost could not reach the WSL web terminal')
        check_guest_listener(port)
        print('Windows localhost HTTP 200; WSL listener is 127.0.0.1 only', flush=True)

        with sync_playwright() as runner:
            browser = runner.chromium.launch(headless=True)
            page, frames = browser_terminal(browser, url)
            native_output = bytearray()
            command = f'stty rows 24 cols 100 && exec sh {script} attach'
            attached = subprocess.Popen([*GUEST, *env, 'script', '-qefc', command, '/dev/null'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

            def read_attached():
                while chunk := attached.stdout.read1(4096):
                    native_output.extend(chunk)

            threading.Thread(target=read_attached, daemon=True).start()
            browser_input(page, "printf '%s%s\\n' WSL_TEST_ BROWSER")
            eventually(lambda: b'WSL_TEST_BROWSER' in native_output, 'WSL attach did not receive browser output')
            expect_frames(page, frames, 'WSL_TEST_BROWSER')

            attached.stdin.write(b"survivor=alive; printf '%s%s\\n' WSL_TEST_ NATIVE\n")
            attached.stdin.flush()
            expect_frames(page, frames, 'WSL_TEST_NATIVE')
            eventually(lambda: b'WSL_TEST_NATIVE' in native_output, 'WSL attach did not receive native output')
            print('Windows Chromium and WSL attach share bidirectional tmux output', flush=True)

            attached.stdin.write(b'\x02d')
            attached.stdin.flush()
            assert attached.wait(timeout=10) == 0
            stop()
            page.close()
            service = start()
            eventually(ready, 'Windows localhost could not reach restarted WSL terminal')
            page, frames = browser_terminal(browser, url)
            browser_input(page, "printf '%s%s\\n' WSL_TEST_PERSISTED_ \"$survivor\"")
            expect_frames(page, frames, 'WSL_TEST_PERSISTED_alive')
            print('tmux shell state survived the WSL web service restart', flush=True)
            browser.close()
    finally:
        if attached is not None and attached.poll() is None:
            attached.terminate()
        stop()
        subprocess.run([*GUEST, *env, 'tmux', '-L', 'leetcode-web-terminal', 'kill-server'], capture_output=True, timeout=8)


if __name__ == '__main__':
    main()
