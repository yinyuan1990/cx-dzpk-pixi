import { ref, computed } from 'vue'
import { TABLE_BACKGROUNDS, TABLE_BG_STORAGE_KEY } from '../config/tableBackgrounds'

// Table background selection + persistence, equivalent to gameUI.js setGameBg.
// null/'' => default CSS felt; otherwise the chosen tablecloth covers the screen.
export function useTableBackground() {
  const selectedBg = ref(localStorage.getItem(TABLE_BG_STORAGE_KEY) || '')

  const feltStyle = computed(() => {
    const opt = TABLE_BACKGROUNDS.find((o) => o.id === selectedBg.value)
    return opt
      ? { backgroundImage: `url(${opt.src})`, backgroundColor: '#0c3a24' }
      : {}
  })

  function selectBg(id) {
    selectedBg.value = id
    localStorage.setItem(TABLE_BG_STORAGE_KEY, id)
  }

  return { backgrounds: TABLE_BACKGROUNDS, selectedBg, feltStyle, selectBg }
}
