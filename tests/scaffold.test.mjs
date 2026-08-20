import assert from "node:assert/strict"
import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function text(path) {
  return readFile(new URL(path, root), "utf8")
}

test("manifest declares safe Phase 0 entry points", async () => {
  const manifest = JSON.parse(await text("manifest.json"))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.id, "io.github.rodrix2000.chess")
  assert.deepEqual(manifest.kinds, ["service", "panel", "bar-widget"])
  assert.deepEqual(manifest.entryPoints, {
    service: "Service.qml",
    panel: "Panel.qml",
    barWidget: "BarWidget.qml"
  })

  for (const entryPoint of Object.values(manifest.entryPoints)) {
    assert.equal(entryPoint.startsWith("/"), false)
    assert.equal(entryPoint.includes(".."), false)
    const status = await lstat(join(root.pathname, entryPoint))
    assert.equal(status.isFile(), true)
    assert.equal(status.isSymbolicLink(), false)
  }
})

test("panel exposes the Omarchy open, close, and opened contract", async () => {
  const panel = await text("Panel.qml")
  assert.match(panel, /readonly property bool opened:/)
  assert.match(panel, /function open\(payloadJson\)/)
  assert.match(panel, /function close\(\)/)
  assert.match(panel, /shell\.hide\(pluginId\)/)
  assert.match(panel, /onVisibleChanged:/)
  assert.match(panel, /forceActiveFocus\(\)/)
})

test("service is headless and bar resolves it through the host", async () => {
  const [service, bar] = await Promise.all([
    text("Service.qml"),
    text("BarWidget.qml")
  ])
  assert.doesNotMatch(service, /\bShellRoot\b/)
  assert.doesNotMatch(service, /FloatingWindow/)
  assert.match(bar, /serviceFor\(moduleName\)/)
  assert.doesNotMatch(bar, /Service\s*\{/)
})

test("root entry points contain no browser or network stack", async () => {
  const sources = await Promise.all([
    text("Service.qml"),
    text("Panel.qml"),
    text("BarWidget.qml")
  ])
  for (const source of sources)
    assert.doesNotMatch(source, /QtWebEngine|WebView|XMLHttpRequest|WebSocket/)
})

test("all committed JSON contracts parse", async () => {
  for (const path of [
    "manifest.json",
    "schemas/settings.schema.json",
    "schemas/game-state.schema.json",
    "schemas/history.schema.json"
  ]) {
    const source = await text(path)
    assert.doesNotThrow(() => JSON.parse(source))
  }
})
