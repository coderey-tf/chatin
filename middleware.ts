import { proxy } from './src/proxy'

export { proxy as middleware }

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login', '/register'],
}
