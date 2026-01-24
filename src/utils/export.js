export function exportToCSV(filename, rows) {
  if (!rows || !rows.length) return

  const separator = ','
  const keys = Object.keys(rows[0])
  
  // Cria o cabeçalho e as linhas
  const csvContent = [
    keys.join(separator),
    ...rows.map(row => 
      keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k]
        cell = cell instanceof Date ? cell.toLocaleString() : cell.toString()
        // Trata aspas e vírgulas dentro do texto para não quebrar o Excel
        cell = cell.replace(/"/g, '""')
        if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`
        return cell
      }).join(separator)
    )
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  
  // Cria um link invisível e clica nele para baixar
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