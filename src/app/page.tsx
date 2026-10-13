import { Cover } from '@/components/organisms/Cover'

// `/` is the cover (`Pond 05 Shell` 5a). `src/proxy.ts` sends a signed-out
// request to /sign-in before this ever renders.
export default function RootPage() {
  return <Cover />
}
