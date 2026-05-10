import { redirect } from 'next/navigation'

export default async function CustomerDetailRedirect({
  params,
}: {
  params: Promise<{ siteId: string; clientId: string }>
}) {
  const { siteId, clientId } = await params
  redirect(`/dashboard/${siteId}/contacts/${clientId}`)
}
