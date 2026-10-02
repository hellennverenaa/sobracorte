import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { formatSectorName, SECTOR_OPTIONS } from '../src/utils/domain.js'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(frontendRoot, 'src')

async function listVueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listVueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  }))
  return nested.flat()
}

function removeTranslatedSectorCalls(value) {
  return value
    .replace(/\b(?:formatSectorName|settingsSectorLabel)\s*\([^)]*\)/gi, ' ')
    .replace(/\b[A-Za-z_$][\w$?.]*\s*(?:===|!==|==|!=)\s*(['"`])APOIO\1/gi, ' ')
    .replace(/(['"`])APOIO\1\s*(?:===|!==|==|!=)\s*[A-Za-z_$][\w$?.]*/gi, ' ')
}

export function findVisibleApoio(templateContent, filename = '<template>') {
  const template = templateContent.replace(/<!--[\s\S]*?-->/g, '')
  const violations = []

  const addIfVisible = (kind, value) => {
    if (/\bAPOIO\b/i.test(removeTranslatedSectorCalls(value))) {
      violations.push({ filename, kind, value: value.trim() })
    }
  }

  for (const match of template.matchAll(/{{([\s\S]*?)}}/g)) {
    addIfVisible('interpolação', match[1])
  }

  const displayAttribute = /(?:^|\s)(:|v-bind:)?(aria-label|aria-description|title|placeholder|alt|label|text|caption|message|v-text|v-html)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (const tag of template.matchAll(/<[A-Za-z][^>]*>/g)) {
    for (const match of tag[0].matchAll(displayAttribute)) {
      addIfVisible(`atributo ${match[2]}`, match[3] ?? match[4] ?? '')
    }
  }

  const staticText = template
    .replace(/{{[\s\S]*?}}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
  addIfVisible('texto estático', staticText)
  return violations
}

test('APOIO permanece como identificador interno e exibe Peças Cortadas', () => {
  const apoio = SECTOR_OPTIONS.find((sector) => sector.id === 'APOIO')
  assert.equal(apoio?.label, 'Peças Cortadas')
  assert.equal(apoio?.shortLabel, 'Peças Cortadas')
  assert.equal(formatSectorName('APOIO'), 'Peças Cortadas')
})

test('a guarda detecta texto visível novo e ignora comparações internas autorizadas', () => {
  const violations = findVisibleApoio(`
    <section>
      <span>Estoque APOIO</span>
      <span>{{ assignedSector === 'APOIO' ? formatSectorName(assignedSector) : 'CORTE' }}</span>
    </section>
  `)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].kind, 'texto estático')

  const dynamicViolations = findVisibleApoio(`<div :title="'APOIO'"></div><span>{{ 'APOIO' }}</span>`)
  assert.equal(dynamicViolations.length, 2)
})

test('templates Vue não exibem o nome interno APOIO em textos e rótulos', async () => {
  const files = await listVueFiles(sourceRoot)
  const violations = []
  for (const filename of files) {
    const source = await readFile(filename, 'utf8')
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [], `Falha ao analisar ${filename}`)
    if (!descriptor.template) continue
    violations.push(...findVisibleApoio(descriptor.template.content, filename))
  }
  assert.deepEqual(violations, [], violations.map((item) => `${item.filename}: ${item.kind} contém ${item.value}`).join('\n'))
})

test('mensagens e rótulos dos relatórios mantêm o nome visível do setor', async () => {
  const dto = await readFile(resolve(frontendRoot, '../backend/src/types/stock.dto.ts'), 'utf8')
  const dashboard = await readFile(resolve(frontendRoot, '../backend/src/controllers/DashboardController.ts'), 'utf8')
  const reportController = await readFile(resolve(frontendRoot, '../backend/src/controllers/ReportController.ts'), 'utf8')

  const messages = [...dto.matchAll(/message:\s*(['"`])([^'"`\n]*)\1/g)].map((match) => match[2])
  assert.ok(messages.length > 0)
  assert.ok(messages.every((message) => !/\bAPOIO\b/i.test(message)), 'mensagens ao usuário não devem expor APOIO')
  assert.match(dashboard, /WHEN s\.sector = 'APOIO' THEN 'Peças Cortadas'/)
  assert.match(dashboard, /sector: 'APOIO', label: 'Peças Cortadas \(Moldes\/Peças\)'/)
  assert.doesNotMatch(dashboard, /label:\s*'[^']*\bAPOIO\b/i)
  assert.match(reportController, /function formatReportSector\(sector: unknown\): unknown/)
  assert.match(reportController, /sector === 'APOIO' \? 'Peças Cortadas' : sector/)
})
