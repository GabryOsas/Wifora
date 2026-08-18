import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import http from 'node:http'
import { WebSocket } from 'ws'
import { createWiforaServer } from '../server.mjs'
import { validHostKey } from '../src/server/security.mjs'
import { tuneOpusSdp } from '../src/audio/profiles.mjs'
import { ROOT_DIR } from '../src/shared/constants.mjs'

function calculateStats(samples) {
  if (!samples.length) return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, stdDev: 0, jitter: 0 }
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const mean = sum / sorted.length
  const p50 = sorted[Math.floor(sorted.length * 0.5)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const p99 = sorted[Math.floor(sorted.length * 0.99)]
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length
  const stdDev = Math.sqrt(variance)

  let diffSum = 0
  for (let i = 1; i < samples.length; i++) {
    diffSum += Math.abs(samples[i] - samples[i - 1])
  }
  const jitter = samples.length > 1 ? diffSum / (samples.length - 1) : 0

  return { min, max, mean, p50, p95, p99, stdDev, jitter }
}

function httpRequest(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function runBenchmark() {
  console.log('='.repeat(70))
  console.log('⚡ WIFORA EMPIRICAL BENCHMARK SUITE')
  console.log('='.repeat(70))
  console.log(`Execution timestamp: ${new Date().toISOString()}`)
  console.log(`Node.js version:     ${process.version}`)
  console.log(`Platform:            ${process.platform} (${process.arch})`)
  console.log('='.repeat(70))

  const results = []

  // 1. Benchmark validHostKey (Constant-Time Verification)
  console.log('\n[1/5] Benchmarking Host Key Verification (10,000 iterations)...')
  const hostKeyA = 'A1_b2-c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u'
  const hostKeyB = 'A1_b2-c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u'
  const hostKeySamples = []
  for (let i = 0; i < 10000; i++) {
    const t0 = performance.now()
    validHostKey(hostKeyA, hostKeyB)
    const t1 = performance.now()
    hostKeySamples.push((t1 - t0) * 1000) // in microseconds
  }
  const keyStats = calculateStats(hostKeySamples)
  results.push({ name: 'Timing-Safe Host Key Auth', unit: 'µs', count: 10000, ...keyStats })

  // 2. Benchmark SDP Opus Tuning
  console.log('[2/5] Benchmarking WebRTC Opus SDP Parsing & Munging (10,000 iterations)...')
  const sampleSdp = [
    'v=0',
    'o=- 123456 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
  ].join('\r\n')

  const sdpSamples = []
  for (let i = 0; i < 10000; i++) {
    const t0 = performance.now()
    tuneOpusSdp(sampleSdp, 'adaptive')
    const t1 = performance.now()
    sdpSamples.push((t1 - t0) * 1000) // in microseconds
  }
  const sdpStats = calculateStats(sdpSamples)
  results.push({ name: 'Opus SDP Munging Engine', unit: 'µs', count: 10000, ...sdpStats })

  // 3. Benchmark HTTP Endpoints on Local Server
  console.log('[3/5] Benchmarking Local HTTP API Latency (1,000 requests)...')
  const app = createWiforaServer({ port: 0 })
  const addr = await app.listen(0, '127.0.0.1')
  const baseUrl = `http://127.0.0.1:${addr.port}`

  const httpSamples = []
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now()
    await httpRequest(`${baseUrl}/api/network`)
    const t1 = performance.now()
    httpSamples.push(t1 - t0) // in milliseconds
  }
  const httpStats = calculateStats(httpSamples)
  results.push({ name: 'HTTP /api/network Latency', unit: 'ms', count: 1000, ...httpStats })

  // 4. Benchmark QR Generation
  console.log('[4/5] Benchmarking QR PNG Image Generation (100 iterations)...')
  const qrSamples = []
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now()
    await httpRequest(`${baseUrl}/qr?text=${encodeURIComponent('http://192.168.1.50:3975/listen.html?room=TEST1234')}`)
    const t1 = performance.now()
    qrSamples.push(t1 - t0)
  }
  const qrStats = calculateStats(qrSamples)
  results.push({ name: 'QR Code PNG Generation', unit: 'ms', count: 100, ...qrStats })

  // 5. Benchmark WebSocket Signaling Round-Trip
  console.log('[5/5] Benchmarking WebSocket Signaling Relay Latency (1,000 messages)...')
  const wsHost = new WebSocket(`ws://127.0.0.1:${addr.port}/signal`, {
    headers: { origin: `http://localhost:${addr.port}` },
  })
  const wsListener = new WebSocket(`ws://127.0.0.1:${addr.port}/signal`, {
    headers: { origin: `http://localhost:${addr.port}` },
  })

  await Promise.all([
    new Promise((res) => wsHost.once('open', res)),
    new Promise((res) => wsListener.once('open', res)),
  ])

  wsHost.send(JSON.stringify({ type: 'register', role: 'host', roomId: 'BENCH001', hostKey: hostKeyA }))
  await new Promise((res) => {
    wsHost.once('message', () => res())
  })

  wsListener.send(
    JSON.stringify({ type: 'register', role: 'listener', roomId: 'BENCH001', sessionId: 'bench-session' })
  )
  await new Promise((res) => {
    wsListener.once('message', () => res())
  })

  const wsSamples = []
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now()
    const p = new Promise((res) => {
      wsListener.once('message', () => {
        const t1 = performance.now()
        wsSamples.push(t1 - t0)
        res()
      })
    })
    wsHost.send(
      JSON.stringify({
        type: 'offer',
        target: 'bench-session',
        sdp: { type: 'offer', sdp: sampleSdp },
      })
    )
    await p
  }
  const wsStats = calculateStats(wsSamples)
  results.push({ name: 'WebSocket Signaling Relay', unit: 'ms', count: 1000, ...wsStats })

  wsHost.close()
  wsListener.close()
  await app.close()

  // Print Formatted Results Table
  console.log('\n' + '='.repeat(88))
  console.log(
    'Metric'.padEnd(30) +
      'Samples'.padStart(8) +
      'Mean'.padStart(10) +
      'p50'.padStart(10) +
      'p95'.padStart(10) +
      'p99'.padStart(10) +
      'Jitter'.padStart(10)
  )
  console.log('-'.repeat(88))

  for (const r of results) {
    console.log(
      `${r.name}`.padEnd(30) +
        `${r.count}`.padStart(8) +
        `${r.mean.toFixed(3)} ${r.unit}`.padStart(10) +
        `${r.p50.toFixed(3)} ${r.unit}`.padStart(10) +
        `${r.p95.toFixed(3)} ${r.unit}`.padStart(10) +
        `${r.p99.toFixed(3)} ${r.unit}`.padStart(10) +
        `${r.jitter.toFixed(3)} ${r.unit}`.padStart(10)
    )
  }
  console.log('='.repeat(88))

  // Write CSV artifact
  const csvRows = [
    'Test_Name,Iterations,Unit,Min,Mean,Median_p50,p95,p99,Max,StdDev,Jitter',
    ...results.map(
      (r) =>
        `"${r.name}",${r.count},${r.unit},${r.min.toFixed(4)},${r.mean.toFixed(4)},${r.p50.toFixed(4)},${r.p95.toFixed(4)},${r.p99.toFixed(4)},${r.max.toFixed(4)},${r.stdDev.toFixed(4)},${r.jitter.toFixed(4)}`
    ),
  ]
  const csvPath = join(ROOT_DIR, 'benchmarks', 'results.csv')
  await writeFile(csvPath, csvRows.join('\n') + '\n', 'utf8')
  console.log(`\n✅ Raw benchmark artifact generated at: ${csvPath}`)

  const summaryPath = join(ROOT_DIR, 'benchmarks', 'benchmark-summary.json')
  await writeFile(summaryPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2) + '\n', 'utf8')
  console.log(`✅ JSON summary generated at: ${summaryPath}`)
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution error:', err)
  process.exit(1)
})
