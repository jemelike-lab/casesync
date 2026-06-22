import { redirect } from 'next/navigation'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { getPageBannerUrl } from '@/lib/workryn/pageBanner'
import BenefitsClient from '@/components/workryn/BenefitsClient'

export const metadata = { title: 'Benefits - Workryn' }

// Prisma Decimal / Date are not serializable across the server→client boundary.
const num = (v: unknown): number | null => (v == null ? null : Number(v as never))
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

export default async function BenefitsPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')
  const { user } = session
  const elevated = isManagerOrAbove(user.role)

  const [gym, retirement, mileage, gymRoster, retirementRoster] = await Promise.all([
    db.benefitGymSelection.findUnique({ where: { userId: user.id } }),
    db.benefitRetirementElection.findUnique({ where: { userId: user.id } }),
    db.benefitMileageSubmission.findMany({
      where: { userId: user.id },
      orderBy: { tripDate: 'desc' },
      take: 100,
    }),
    elevated
      ? db.benefitGymSelection.findMany({
          orderBy: { updatedAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true } } },
        })
      : Promise.resolve([]),
    elevated
      ? db.benefitRetirementElection.findMany({
          orderBy: { updatedAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true } } },
        })
      : Promise.resolve([]),
  ])

  const bannerUrl = await getPageBannerUrl('employee benefits')

  const ownGym = gym
    ? {
        selection: gym.selection,
        preferredStartDate: iso(gym.preferredStartDate),
        authorizationAck: gym.authorizationAck,
        signatureName: gym.signatureName,
        emailedAt: iso(gym.emailedAt),
        updatedAt: iso(gym.updatedAt),
      }
    : null

  const ownRetirement = retirement
    ? {
        deferralType: retirement.deferralType,
        deferralValue: num(retirement.deferralValue),
        preTax: retirement.preTax,
        allocations: (retirement.allocations as Record<string, number>) ?? {},
        beneficiaries: (retirement.beneficiaries as Array<{ tier: string; name: string; relationship: string; percent: number }>) ?? [],
        signatureName: retirement.signatureName,
        emailedAt: iso(retirement.emailedAt),
        updatedAt: iso(retirement.updatedAt),
      }
    : null

  const ownMileage = mileage.map((m) => ({
    id: m.id,
    tripDate: iso(m.tripDate),
    miles: num(m.miles),
    purpose: m.purpose,
    ratePerMile: num(m.ratePerMile),
    amount: num(m.amount),
    submittedAt: iso(m.submittedAt),
    emailedAt: iso(m.emailedAt),
  }))

  const gymRosterRows = elevated
    ? gymRoster.map((r) => ({
        userId: r.userId,
        userName: r.user?.name ?? r.user?.email ?? 'Unknown',
        selection: r.selection,
        preferredStartDate: iso(r.preferredStartDate),
        signatureName: r.signatureName,
        emailedAt: iso(r.emailedAt),
        updatedAt: iso(r.updatedAt),
      }))
    : []

  const retirementRosterRows = elevated
    ? retirementRoster.map((r) => ({
        userId: r.userId,
        userName: r.user?.name ?? r.user?.email ?? 'Unknown',
        deferralValue: num(r.deferralValue),
        signatureName: r.signatureName,
        emailedAt: iso(r.emailedAt),
        updatedAt: iso(r.updatedAt),
      }))
    : []

  return (
    <BenefitsClient
      bannerUrl={bannerUrl}
      profile={{ name: user.name ?? '', email: user.email ?? '' }}
      elevated={elevated}
      ownGym={ownGym}
      ownRetirement={ownRetirement}
      ownMileage={ownMileage}
      gymRoster={gymRosterRows}
      retirementRoster={retirementRosterRows}
    />
  )
}
