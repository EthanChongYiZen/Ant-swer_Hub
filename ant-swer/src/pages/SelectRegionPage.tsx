import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/toast'
import { REGION_FLAGS } from '../lib/utils'

const REGION_GROUPS: Record<string, string[]> = {
  'Asia Pacific': ['Malaysia', 'Singapore', 'China', 'Hong Kong', 'Japan', 'South Korea', 'Taiwan', 'Thailand', 'Vietnam', 'Philippines', 'Indonesia', 'India', 'Australia', 'New Zealand', 'Bangladesh', 'Pakistan'],
  'Europe': ['United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Poland', 'Sweden', 'Switzerland'],
  'Americas': ['United States', 'Canada', 'Mexico', 'Brazil'],
  'Middle East & Africa': ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'South Africa', 'Nigeria', 'Kenya'],
}

export default function SelectRegionPage() {
  const { updateUserRegion } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!selected) return
    setLoading(true)
    try {
      await updateUserRegion(selected)
      toast(`Region set to ${selected}`, 'success')
      navigate('/dashboard')
    } catch {
      toast('Failed to set region', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="text-xl font-bold text-foreground">Ant-Swer</span>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-semibold text-foreground mb-1">Select your region</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This determines which group chat you join. You can't change this later without contacting support.
          </p>

          {Object.entries(REGION_GROUPS).map(([group, countries]) => (
            <div key={group} className="mb-6">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {countries.map(country => (
                  <button
                    key={country}
                    onClick={() => setSelected(country)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                      ${selected === country
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5'
                      }`}
                  >
                    <span className="text-lg">{REGION_FLAGS[country]}</span>
                    <span className="truncate">{country}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleConfirm}
              disabled={!selected || loading}
              className="btn-primary px-6"
            >
              {loading ? 'Confirming…' : selected ? `Confirm — ${REGION_FLAGS[selected]} ${selected}` : 'Select a region to continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
