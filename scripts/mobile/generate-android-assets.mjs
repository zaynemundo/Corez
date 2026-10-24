// Regenerates the Android launcher icons and splash screens from the Corez
// brand mark. Capacitor ships placeholder art (Android robot on a white
// splash); this overwrites each existing resource at its current pixel size so
// the resource qualifiers (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi, port/land) keep
// matching what the Android build expects.
//
// Usage: node scripts/mobile/generate-android-assets.mjs [--src public/corez.png]
import { writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
const args = process.argv.slice(2)
const srcArgIndex = args.indexOf('--src')
const SRC = path.resolve(ROOT, srcArgIndex >= 0 ? args[srcArgIndex + 1] : 'public/corez.png')

const BRAND_BG = { r: 10, g: 10, b: 10, alpha: 1 }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function listPngs(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listPngs(full)))
    else if (entry.name.toLowerCase().endsWith('.png')) out.push(full)
  }
  return out
}

// The brand mark ships as pure-black RGB behind an alpha mask (a black glyph on
// transparency). Composited onto the dark #0A0A0A canvas unchanged it would be
// invisible, so detect exactly that case and flip the glyph to white. A future
// coloured logo is used verbatim.
async function loadMark() {
  const stats = await sharp(SRC).stats()
  const isPureBlack = stats.channels.slice(0, 3).every((channel) => channel.max === 0)
  if (isPureBlack) console.log('mark    : pure black detected -> rendered white on dark')
  return sharp(SRC).negate({ alpha: false }).png().toBuffer()
}

function roundedMask(size, radius) {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
}

async function markAt(mark, size, inset) {
  const logoSize = Math.round(size * inset)
  return sharp(mark)
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
}

async function composeIcon(mark, size, { inset = 0.62, transparent = false, round = false }) {
  const logo = await markAt(mark, size, inset)
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: transparent ? TRANSPARENT : BRAND_BG,
    },
  })

  let img = await base.composite([{ input: logo, gravity: 'center' }]).png().toBuffer()

  if (round) {
    img = await sharp(img)
      .composite([{ input: roundedMask(size, size / 2), blend: 'dest-in' }])
      .png()
      .toBuffer()
  }
  return img
}

async function composeSplash(mark, width, height) {
  const logo = await markAt(mark, Math.min(width, height), 0.42)
  return sharp({ create: { width, height, channels: 4, background: BRAND_BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function main() {
  const mark = await loadMark()
  const files = await listPngs(RES)
  let icons = 0
  let splashes = 0

  for (const file of files) {
    const name = path.basename(file).toLowerCase()
    const { width, height } = await sharp(file).metadata()

    if (name.startsWith('ic_launcher_foreground')) {
      await writeFile(file, await composeIcon(mark, width, { inset: 0.58, transparent: true }))
      icons++
      continue
    }
    if (name.startsWith('ic_launcher_round')) {
      await writeFile(file, await composeIcon(mark, width, { inset: 0.66, round: true }))
      icons++
      continue
    }
    if (name.startsWith('ic_launcher')) {
      await writeFile(file, await composeIcon(mark, width, { inset: 0.68 }))
      icons++
      continue
    }
    if (name.startsWith('splash')) {
      await writeFile(file, await composeSplash(mark, width, height))
      splashes++
      continue
    }
  }

  console.log(`source   : ${path.relative(ROOT, SRC)}`)
  console.log(`icons    : ${icons} launcher PNGs rewritten`)
  console.log(`splashes : ${splashes} splash PNGs rewritten`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

