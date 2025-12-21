// useRecord.js - 完整修正代码

import {ref} from 'vue'

export function useRecord() {
    const isRecordOpen = ref(false)
    // const isStreaming = ref(false)
    // const currentDevice = ref(null)
    // const deviceList = ref([])
    // const isLoading = ref(false)

    const toggleWebpage = () => {
        isRecordOpen.value = !isRecordOpen.value
        console.log(" isRecordOpen.value",  isRecordOpen.value)
    }

    const closeRecord = () => {
        isRecordOpen.value = false
    }

    return {
        isRecordOpen,
        toggleWebpage,
        closeRecord
    }
}