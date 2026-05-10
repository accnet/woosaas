import { redirect } from 'next/navigation'

export default async function CustomersRedirect({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  redirect(`/dashboard/${siteId}/contacts`)
}
