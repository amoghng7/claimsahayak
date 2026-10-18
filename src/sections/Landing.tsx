import { ProgressSteps } from '../components/ProgressSteps'
import { Kicker, NumberedSection } from '../components/kit'
import { ScoreStamp } from '../components/ScoreStamp'

export function Landing({ onOpen, onSample }: { onOpen: () => void; onSample: (id: string) => void }) {
  return (
    <main>
      <section aria-labelledby="hero" className="mx-auto max-w-shell px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 md:px-8 md:pt-24">
        <Kicker>Google Cloud AI Builder Cup · JAPAC 2026</Kicker>
        <div className="mt-8 grid items-start gap-10 md:grid-cols-[1.25fr_1fr] md:gap-16">
          <div className="min-w-0">
            <h1
              id="hero"
              className="font-display font-semibold leading-[1.02]"
              style={{ fontSize: 'clamp(2rem, 7vw + 0.5rem, 4.25rem)', letterSpacing: '-0.028em' }}
            >
              The insurer read your policy.{' '}
              <em className="font-display">Did you?</em>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-3 sm:text-lg">
              Upload the policy and the hospital bill. You get the cuts, the missing papers, and a letter if the claim was rejected.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={onOpen}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-chart px-6 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition-transform duration-150 hover:-translate-y-0.5 sm:px-7 sm:py-3.5 sm:text-[13px]"
                style={{ boxShadow: '0 1px 0 var(--ink)' }}
              >
                Open the desk →
              </button>
              <button
                onClick={() => onSample('ramesh-iyer')}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/40 px-6 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-ink transition-colors duration-150 hover:bg-paper-2 sm:px-7 sm:py-3.5 sm:text-[13px]"
              >
                See the room-rent trap
              </button>
            </div>
          </div>

          <div className="panel-2 min-w-0 p-4 sm:p-6 md:mt-10 md:rotate-[0.6deg]">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <span className="min-w-0 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                Case file · NA/HC/21/884532
              </span>
              <span className="shrink-0 font-mono text-[11px] text-crimson-deep">FLAGGED</span>
            </div>
            <div className="flex flex-col items-start gap-4 py-5 sm:flex-row sm:items-center sm:gap-6">
              <ScoreStamp score={53} band="fair" size={120} />
              <div className="min-w-0 space-y-2 font-mono text-[12px] leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  Room-rent trap · −₹75,750
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  2 mandatory documents missing
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--mint)' }} />
                  Waiting periods served
                </div>
              </div>
            </div>
            <div className="border-t border-line pt-3 font-mono text-[11px] text-ink-3">
              R. Iyer · ₹4,35,000 bill · Pune
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-line pt-12 sm:mt-16 sm:pt-14 md:mt-20">
          <ProgressSteps mode="promise" headingId="how-simple" />
        </div>

        <div className="mt-12 grid gap-px border border-line bg-line sm:mt-16 md:grid-cols-3">
          {[
            ['≈40%', 'of health-claim rejections come from missing papers or procedure. Those can still be fixed.'],
            ['1% of SI / day', 'A common room-rent cap. Go over it and the linked charges shrink with it.'],
            ['5 years', 'After this, a claim cannot be rejected for non-disclosure, except for proven fraud.'],
          ].map(([fig, text]) => (
            <div key={fig} className="bg-paper px-5 py-5 sm:px-7 sm:py-6">
              <div className="font-mono text-2xl font-semibold">{fig}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-shell space-y-12 px-4 py-12 sm:space-y-16 sm:px-6 sm:py-16 md:space-y-20 md:px-8">
        <NumberedSection no="01" id="section-01" title="Room rent">
          <p>
            A room above the cap does not only lose the extra rent. Surgeon, anaesthesia, and OT
            charges shrink by the same ratio. An ₹8,000 room on a ₹5,000 cap is a{' '}
            <span className="font-mono text-ink">0.625×</span> cut. On a ₹4.2 lakh surgery that is
            about ₹75,000.
          </p>
        </NumberedSection>

        <NumberedSection no="02" id="section-02" title="What gets checked">
          <p>
            Policy, discharge summary, and the itemised bill. The desk checks the document list,
            waiting periods, and room rent, then scores the file out of 100 with the reasons beside
            the number.
          </p>
        </NumberedSection>

        <NumberedSection no="03" id="section-03" title="If it was rejected">
          <p>
            Paste the letter. The desk names the ground, says whether it can be fought, and drafts
            a grievance with the clause it uses. Next is the insurer&apos;s grievance cell, then
            Bima Bharosa, then the Ombudsman.
          </p>
        </NumberedSection>

        <NumberedSection no="04" id="section-04" title="In Hindi">
          <p>
            Each result ends with a short Hindi summary:{' '}
            <span className="font-display">क्या खतरा है, कितना पैसा कटेगा, और अब क्या करना है</span>.
          </p>
        </NumberedSection>
      </section>

      <section aria-labelledby="principle" className="bg-ink text-paper">
        <div className="mx-auto max-w-shell px-4 py-14 sm:px-6 sm:py-16 md:px-8 md:py-20">
          <span className="kicker" style={{ color: 'color-mix(in srgb, var(--paper) 65%, transparent)' }}>
            <span className="pulse-dot ok" style={{ background: 'var(--chart)' }} aria-hidden />
            How the sums are made
          </span>
          <h2 id="principle" className="mt-6 font-display font-semibold leading-tight" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)' }}>
            The rupees come from code.
          </h2>
          <div className="mt-12 grid gap-px md:grid-cols-2" style={{ background: 'color-mix(in srgb, var(--paper) 18%, transparent)' }}>
            <div className="bg-ink p-5 sm:p-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--chart)' }}>
                The sums
              </div>
              <p className="mt-4 leading-relaxed" style={{ color: 'color-mix(in srgb, var(--paper) 78%, transparent)' }}>
                Room rent, co-pay, and the score are calculated from the papers. The model does not invent a rupee.
              </p>
            </div>
            <div className="bg-ink p-5 sm:p-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--chart)' }}>
                The reading
              </div>
              <p className="mt-4 leading-relaxed" style={{ color: 'color-mix(in srgb, var(--paper) 78%, transparent)' }}>
                Gemini reads the PDFs and drafts the letter. Each point cites the rule it uses.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="cta" className="mx-auto flex max-w-shell flex-col items-stretch gap-6 px-4 py-12 sm:items-start sm:px-6 sm:py-16 md:px-8">
        <h2 id="cta" className="font-display font-semibold leading-tight" style={{ fontSize: 'clamp(1.75rem, 3.4vw + 0.5rem, 2.75rem)' }}>
          Check the file before you send it.
        </h2>
        <button
          onClick={onOpen}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-paper transition-transform duration-150 hover:-translate-y-0.5 sm:px-7 sm:py-3.5 sm:text-[13px]"
        >
          Open the desk →
        </button>
        <p className="max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
          Not insurance or legal advice. These are estimates from your documents. The insurer&apos;s figure is final.
        </p>
      </section>
    </main>
  )
}
