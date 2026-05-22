import Link from 'next/link'
import { ArrowRight, BarChart3, ShieldCheck, Store } from 'lucide-react'
import styles from './landing.module.css'

export function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>W</span>
          <span>Woosaas</span>
        </Link>
        <Link href="/login" className={styles.loginButton}>
          Login
          <ArrowRight className={styles.buttonIcon} />
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <ShieldCheck className={styles.eyebrowIcon} />
            Commerce analytics for WooCommerce teams
          </div>
          <h1 className={styles.title}>Understand orders, customers, and store growth in one workspace.</h1>
          <p className={styles.description}>
            Woosaas connects store data, tracking signals, exports, and team access so operators can move from daily reporting to action faster.
          </p>
          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryButton}>
              Open dashboard
              <ArrowRight className={styles.buttonIcon} />
            </Link>
            <Link href="/register" className={styles.secondaryButton}>
              Create account
            </Link>
          </div>
        </div>

        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <div>
              <div className={styles.previewTitle}>Store Overview</div>
              <div className={styles.previewSubtitle}>Live commerce snapshot</div>
            </div>
            <div className={styles.previewIcon}>
              <BarChart3 className={styles.chartIcon} />
            </div>
          </div>

          <div className={styles.metricGrid}>
            <Metric label="Revenue" value="$42.8k" />
            <Metric label="Orders" value="1,284" />
            <Metric label="Customers" value="936" />
            <Metric label="Tracking" value="98.4%" />
          </div>

          <div className={styles.storePanel}>
            <div className={styles.storeTitle}>
              <Store className={styles.storeIcon} />
              Connected stores
            </div>
            <div className={styles.storeList}>
              {['Primary Shop', 'Wholesale Store', 'EU Storefront'].map((name) => (
                <div key={name} className={styles.storeRow}>
                  <span>{name}</span>
                  <span className={styles.healthy}>Healthy</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  )
}
