export function exportToCSV(filename, rows) {
  if (!rows || !rows.length) return

  // 1. Força o Ponto e Vírgula (Padrão do Excel no Brasil)
  const separator = ';'
  const keys = Object.keys(rows[0])

  // 2. Monta o cabeçalho e as linhas
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k]
        // Trata textos: escapa aspas duplas e remove quebras de linha perigosas
        cell = String(cell).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, " ")
        // Envolve tudo em aspas para o Ponto e Vírgula dentro do texto não quebrar a coluna
        return `"${cell}"`
      }).join(separator)
    }).join('\n')

  // 3. O Segredo dos Acentos: \uFEFF (UTF-8 BOM) avisa o Excel para ler caracteres latinos e o m²
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  
  // 4. Dispara o Download
  const link = document.createElement('a')
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}