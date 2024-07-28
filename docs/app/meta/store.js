export default function meta (state, emitter) {
  state.meta = state.meta || {}

  emitter.on('meta', function (props) {
    const preserve = []

    if ('title' in props) state.title = props.title

    for (const [key, value] of Object.entries(props)) {
      preserve.push(key)

      if (key !== 'title') state.meta[key] = value

      if (typeof window !== 'undefined' && state.meta[key] !== value) {
        if (key === 'title') {
          document.title = value
        } else {
          const el = document.head.querySelector(`meta[name="${key}"]`)
          if (el) {
            el.setAttribute('content', value)
          } else {
            const el = document.createElement('meta')
            el.setAttribute('name', key)
            el.setAttribute('content', value)
          }
        }
      }
    }

    for (const key of Object.keys(state.meta)) {
      if (!preserve.includes(key)) {
        delete state.meta[key]
        if (typeof window !== 'undefined') {
          const el = document.head.querySelector(`meta[name="${key}"]`)
          if (el) el.remove()
        }
      }
    }
  })
}
