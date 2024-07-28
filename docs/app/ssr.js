import app from './main.js'
import { ROUTER } from 'yeet-router'
import getAllRoutes from 'yeet-router/get-all-routes'

function routes (state) {
  return getAllRoutes(state[ROUTER])
}

export { app, routes }
export { render } from 'yeet'
