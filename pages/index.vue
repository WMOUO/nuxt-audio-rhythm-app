<template>
  <div class="container mx-auto p-4 space-y-4">
    <h1 class="text-2xl font-bold">節奏判斷器</h1>

    <!-- File upload section -->
    <div>
      <label class="block mb-2 font-medium">上傳音檔</label>
      <input
        type="file"
        accept="audio/*"
        @change="onFileChange"
        class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
      />
    </div>

    <!-- Waveform display for the uploaded audio -->
    <div v-if="audioBuffer" class="space-y-2">
      <div ref="waveformRef" class="w-full h-24"></div>
      <!-- simple progress bar showing recording progress relative to the uploaded audio -->
      <div class="relative w-full h-2 bg-gray-200 rounded">
        <div
          class="absolute top-0 left-0 h-2 bg-blue-500 rounded"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
    </div>

    <!-- Recording controls -->
    <div class="flex items-center space-x-4">
      <button
        @click="startRecording"
        class="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
        :disabled="recording || !audioBuffer"
      >
        {{ recording ? '錄音中…' : '開始錄音' }}
      </button>
      <button
        v-if="recording"
        @click="stopRecording"
        class="px-4 py-2 rounded text-white bg-red-600 hover:bg-red-700"
      >
        結束錄音
      </button>
    </div>

    <!-- Display recorded waveform -->
    <div v-if="showRecordedCanvas" class="space-y-2">
      <h2 class="text-lg font-semibold">錄音波形</h2>
      <canvas ref="recordWaveCanvas" class="w-full h-24 border"></canvas>
    </div>

    <!-- Display result -->
    <div v-if="result !== null" class="p-4 bg-gray-100 rounded">
      <p>錯誤節奏數量：{{ result }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import WaveSurfer from 'wavesurfer.js'

// References to DOM elements
const waveformRef = ref<HTMLElement | null>(null)
const recordWaveCanvas = ref<HTMLCanvasElement | null>(null)

// Reactive state
const audioBuffer = ref<AudioBuffer | null>(null)
const expectedBeats = ref<number[]>([])
const recording = ref(false)
const progress = ref(0)
const result = ref<number | null>(null)
const showRecordedCanvas = ref(false)

// Internal variables
let waveSurfer: any = null
let audioContext: AudioContext
let recorder: MediaRecorder | null = null
let recordedChunks: BlobPart[] = []
let recordStart: number = 0

// Setup AudioContext on mount
onMounted(() => {
  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
})

/**
 * Handle file selection, decode the audio and initialise Wavesurfer.
 */
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || !input.files[0]) return
  const file = input.files[0]
  const arrayBuffer = await file.arrayBuffer()
  audioBuffer.value = await audioContext.decodeAudioData(arrayBuffer)

  // Destroy previous instance if exists
  if (waveSurfer) {
    waveSurfer.destroy()
  }

  waveSurfer = WaveSurfer.create({
    container: waveformRef.value!,
    waveColor: '#ddd',
    progressColor: '#60a5fa',
    cursorColor: '#ef4444',
    height: 80,
    responsive: true,
  })
  waveSurfer.loadBlob(file)

  // Precompute expected beats from the uploaded audio
  expectedBeats.value = getPeaks(audioBuffer.value, 0.25)

  // Reset previous results
  result.value = null
  showRecordedCanvas.value = false
  progress.value = 0
}

/**
 * Extract peak times from an AudioBuffer. This simple algorithm scans
 * the waveform in windows and records the times where the amplitude
 * crosses a threshold. The minimum separation between peaks is used
 * to avoid counting the same beat multiple times.
 */
function getPeaks(buffer: AudioBuffer | null, minSeparation: number) {
  if (!buffer) return []
  const data = buffer.getChannelData(0)
  const peaks: number[] = []
  const sampleRate = buffer.sampleRate
  const windowSize = Math.floor(sampleRate * 0.02) // 20ms window
  let lastPeak = -Infinity
  for (let i = 0; i < data.length; i += windowSize) {
    let windowMax = 0
    for (let j = i; j < Math.min(i + windowSize, data.length); j++) {
      const abs = Math.abs(data[j])
      if (abs > windowMax) windowMax = abs
    }
    // Use an empirically chosen threshold
    if (windowMax > 0.5) {
      const time = i / sampleRate
      if (time - lastPeak >= minSeparation) {
        peaks.push(time)
        lastPeak = time
      }
    }
  }
  return peaks
}

/**
 * Start recording using the MediaRecorder API. This also starts
 * updating the progress bar relative to the uploaded audio's
 * duration.
 */
async function startRecording() {
  if (!audioBuffer.value) return
  result.value = null
  showRecordedCanvas.value = false
  recordedChunks = []
  recording.value = true
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }
  recorder.start()
  recordStart = audioContext.currentTime
  // Update progress bar
  const duration = audioBuffer.value.duration
  const interval = setInterval(() => {
    if (!recording.value) {
      clearInterval(interval)
      return
    }
    const currentTime = audioContext.currentTime - recordStart
    progress.value = Math.min((currentTime / duration) * 100, 100)
  }, 50)
}

/**
 * Stop recording, decode the recorded audio, display its waveform and
 * compute the timing errors relative to the uploaded audio's peaks.
 */
function stopRecording() {
  if (!recorder) return
  recording.value = false
  recorder.stop()
  recorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' })
    const arrayBuffer = await blob.arrayBuffer()
    const recBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const recPeaks = getPeaks(recBuffer, 0.25)
    drawRecordedWave(recBuffer)
    result.value = compareBeats(expectedBeats.value, recPeaks)
    showRecordedCanvas.value = true
  }
}

/**
 * Draw the recorded audio waveform onto a canvas. This gives the user
 * a visual representation of their tapping/clapping during recording.
 */
function drawRecordedWave(buffer: AudioBuffer) {
  const canvas = recordWaveCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  const data = buffer.getChannelData(0)
  const step = Math.ceil(data.length / width)
  const amp = height / 2
  ctx.beginPath()
  for (let i = 0; i < width; i++) {
    let min = 1.0
    let max = -1.0
    for (let j = 0; j < step; j++) {
      const val = data[i * step + j] || 0
      if (val < min) min = val
      if (val > max) max = val
    }
    ctx.moveTo(i, (1 + min) * amp)
    ctx.lineTo(i, (1 + max) * amp)
  }
  ctx.strokeStyle = '#60a5fa'
  ctx.stroke()
}

/**
 * Compare recorded beat times with expected beat times. Each expected
 * beat is matched to the nearest recorded beat that hasn't already been
 * paired. A mismatch is counted when the timing difference exceeds a
 * threshold of 100ms. If an expected beat has no recorded counterpart,
 * it also counts as a mismatch.
 */
function compareBeats(expected: number[], recorded: number[]) {
  let mismatches = 0
  const used = new Array(recorded.length).fill(false)
  expected.forEach((exp) => {
    let bestIdx = -1
    let bestDiff = Infinity
    recorded.forEach((rec, idx) => {
      if (used[idx]) return
      const diff = Math.abs(rec - exp)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = idx
      }
    })
    if (bestIdx === -1 || bestDiff > 0.1) {
      mismatches++
    } else {
      used[bestIdx] = true
    }
  })
  return mismatches
}
</script>

<style scoped>
/* Style overrides for the waveform and canvas to ensure they
   expand horizontally with the container. */
#waveform {
  width: 100%;
}
canvas {
  width: 100%;
  display: block;
}
</style>
