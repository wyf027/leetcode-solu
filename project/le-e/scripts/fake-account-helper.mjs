#!/usr/bin/env node

const command = process.argv[2]

if (command === 'folders') {
  process.stdout.write(
    `${JSON.stringify({
      status: 200,
      folders: [
        {
          slug: 'fake-default',
          name: '默认收藏',
          writable: true,
          questions: [{ title: '两数之和', slug: 'two-sum' }],
        },
        {
          slug: 'fake-linked-list',
          name: '链表',
          writable: true,
          questions: [{ title: '两数相加', slug: 'add-two-numbers' }],
        },
      ],
    })}\n`,
  )
} else if (command === 'add' || command === 'remove') {
  const operation = command === 'add' ? 'addQuestionToFavoriteV2' : 'removeQuestionFromFavoriteV2'
  process.stdout.write(`${JSON.stringify({ status: 200, result: { ok: true, operation } })}\n`)
} else {
  process.stderr.write(`Unsupported fake account command: ${process.argv.slice(2).join(' ')}\n`)
  process.exitCode = 2
}
