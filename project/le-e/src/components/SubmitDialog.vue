<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import type { ProblemSummary } from '../domain/problem'
import { THEME } from '../styles/theme'

defineProps<{
  cols: number
  rows: number
  problem: ProblemSummary | null
  testStatus: string
}>()
</script>

<template>
  <TBox
    :x="Math.floor(cols * 0.18)"
    :y="Math.floor(rows * 0.28)"
    :w="Math.floor(cols * 0.64)"
    :h="10"
    :z-index="30"
    border
    title="Confirm LeetCode submission"
    :padding="1"
    :style="THEME.overlay"
    :title-style="THEME.warning"
  >
    <TText :x="1" :y="1" :value="problem ? `#${problem.id} ${problem.title}` : 'Unknown problem'" />
    <TText :x="1" :y="2" value="Language: javascript · source prepared in this session" />
    <TText :x="1" :y="3" :value="`Latest test: ${testStatus}`" />
    <TText
      :x="1"
      :y="5"
      value="y submit once · n / Enter / Esc cancel (default)"
      :style="THEME.warning"
    />
  </TBox>
</template>
