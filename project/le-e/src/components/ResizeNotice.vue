<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import { RUNTIME_CONFIG } from '../config/runtime'
import { THEME } from '../styles/theme'

defineProps<{ cols: number; rows: number }>()
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows"
    border
    title="le-e · terminal too small"
    :padding="1"
    :style="THEME.borderActive"
    :title-style="THEME.title"
  >
    <TText
      :x="1"
      :y="1"
      :w="Math.max(1, cols - 4)"
      :value="`Current ${cols}x${rows} · need ${RUNTIME_CONFIG.minimumColumns}x${RUNTIME_CONFIG.minimumRows}`"
    />
    <TText :x="1" :y="3" value="Resize the terminal or press Ctrl+C to quit." />
  </TBox>
</template>
