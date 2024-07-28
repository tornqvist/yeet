const files = import.meta.glob('../**/*.md')

const pages = Object.keys(files).reduce(function (acc, file) {
  const path = file.replace(/^\.\.(.*?)(\/index)?\.md$/, '$1') || '/'
  acc[path] = files[file]
  return acc
}, {})

export { pages }
