import { redirect } from 'next/navigation'

export default async function SiteTeamRedirect({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  redirect(`/dashboard/teams?siteId=${siteId}`)
}
