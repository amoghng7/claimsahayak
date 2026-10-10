import { Kicker, NumberedSection } from '../components/kit'
import { ScoreStamp } from '../components/ScoreStamp'

export function Landing({ onOpen, onSample }: { onOpen: () => void; onSample: (id: string) => void }) {
  return (
    <main>
      {/* ——— Hero: asymmetric editorial split, dossier card floating right ——— */}
      <section aria-labelledby="hero" className="mx-auto max-w-shell px-8 pt-16 pb-20 md:pt-24">
        <Kicker>Google Cloud AI Builder Cup · JAPAC 2026</Kicker>
        <div className="mt-8 grid gap-12 md:grid-cols-[1.25fr_1fr] md:gap-16 items-start">
          <div>
            <h1
              id="hero"
              className="font-display font-semibold leading-[1.02]"
              style={{ fontSize: 'clamp(44px, 5.6vw, 68px)', letterSpacing: '-0.028em' }}
            >
              The insurer read your policy.{' '}
              <em className="font-display">Did you?</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-3">
              ClaimSahayak reads your policy schedule and hospital bill the way a claims
              assessor would — then shows you the deduction traps, the missing paperwork,
              and the letter to write back. Before the rejection, not after.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={onOpen}
                className="rounded-full bg-chart px-7 py-3.5 font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-ink transition-transform duration-150 hover:-translate-y-0.5"
                style={{ boxShadow: '0 1px 0 var(--ink)' }}
              >
                Open the readiness desk →
              </button>
              <button
                onClick={() => onSample('ramesh-iyer')}
                className="rounded-full border border-ink/40 px-7 py-3.5 font-mono text-[13px] uppercase tracking-[0.08em] text-ink transition-colors duration-150 hover:bg-paper-2"
              >
                See the room-rent trap
              </button>
            </div>
          </div>

          {/* floating dossier card — the product, not a stock photo */}
          <div className="panel-2 p-6 md:mt-10 rotate-[0.6deg]">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                Case file · NA/HC/21/884532
              </span>
              <span className="font-mono text-[11px] text-crimson-deep">FLAGGED</span>
            </div>
            <div className="flex items-center gap-6 py-5">
              <ScoreStamp score={53} band="fair" size={132} />
              <div className="space-y-2 font-mono text-[12px] leading-relaxed">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  Room-rent trap · −₹75,750
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  2 mandatory documents missing
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--mint)' }} />
                  Waiting periods served
                </div>
              </div>
            </div>
            <div className="border-t border-line pt-3 font-mono text-[11px] text-ink-3">
              R. Iyer · ₹4,35,000 bill · Pune
            </div>
          </div>
        </div>

        {/* fact strip — hairline-separated, mono figures */}
        <div className="mt-20 grid gap-px border border-line bg-line md:grid-cols-3">
          {[
            ['≈40%', 'of health-claim rejections trace to documentation and procedural lapses — the most reversible class of all'],
            ['1% of SI / day', 'the room-rent cap buried in most retail policies — breach it and every linked charge shrinks proportionally'],
            ['5 years', 'the moratorium after which an insurer can no longer repudiate for non-disclosure, except on proven fraud'],
          ].map(([fig, text]) => (
            <div key={fig} className="bg-paper px-7 py-6">
              <div className="font-mono text-2xl font-semibold">{fig}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Numbered editorial sections ——— */}
      <section className="mx-auto max-w-shell px-8 py-16 space-y-20">
        <NumberedSection no="01" id="section-01" title="The trap nobody reads">
          <p>
            Pick a room one category above your sub-limit and the insurer doesn&apos;t just
            refuse the excess rent — it pays <em>every</em> charge tied to room category
            (surgeon, anaesthesia, OT) in the same proportion. An ₹8,000 room on a ₹5,000
            cap means a <span className="font-mono text-ink">0.625×</span> multiplier on the
            rest of the bill. On a ₹4.2 lakh surgery, that single choice quietly removes
            ₹75,000.
          </p>
        </NumberedSection>

        <NumberedSection no="02" id="section-02" title="The desk that reads first">
          <p>
            Upload the policy schedule, the discharge summary and the itemised bill. The desk
            checks your file against the IRDAI-standard document list, verifies every waiting
            period against the admission date, prices the room-rent exposure to the rupee,
            and scores the claim&apos;s readiness out of 100 — with the reasons, not just the
            number.
          </p>
        </NumberedSection>

        <NumberedSection no="03" id="section-03" title="The letter to write back">
          <p>
            Already rejected? Paste the repudiation letter. The desk classifies the ground —
            non-disclosure, waiting period, deficiency, delay, sub-limit, exclusion — tells you
            whether it is reversible, and drafts the grievance letter with the regulation cited
            clause-by-clause, plus the escalation route: insurer&apos;s grievance cell, then
            Bima Bharosa, then the Insurance Ombudsman. Free, and winnable.
          </p>
        </NumberedSection>

        <NumberedSection no="04" id="section-04" title="In a language the family reads">
          <p>
            A verdict is useless if the person holding the hospital file can&apos;t read it.
            Every analysis closes with a plain Hindi summary —{' '}
            <span className="font-display">क्या खतरा है, कितना पैसा कटेगा, और अब क्या करना है</span> —
            because the claim is usually managed by parents, not policy nerds.
          </p>
        </NumberedSection>
      </section>

      {/* ——— Dark section: how the desk thinks ——— */}
      <section aria-labelledby="principle" className="bg-ink text-paper">
        <div className="mx-auto max-w-shell px-8 py-20">
          <span className="kicker" style={{ color: 'color-mix(in srgb, var(--paper) 65%, transparent)' }}>
            <span className="pulse-dot ok" style={{ background: 'var(--chart)' }} aria-hidden />
            Design principle
          </span>
          <h2 id="principle" className="mt-6 font-display font-semibold leading-tight" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)' }}>
            Arithmetic, not opinion.{' '}
            <em style={{ color: 'var(--chart)' }}>Words, grounded.</em>
          </h2>
          <div className="mt-12 grid gap-px md:grid-cols-2" style={{ background: 'color-mix(in srgb, var(--paper) 18%, transparent)' }}>
            <div className="bg-ink p-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--chart)' }}>
                The rules engine
              </div>
              <p className="mt-4 leading-relaxed" style={{ color: 'color-mix(in srgb, var(--paper) 78%, transparent)' }}>
                Every rupee figure — the room-rent ratio, the proportional cut, the co-pay,
                the readiness score — is computed by deterministic code from extracted values.
                A model can read your documents; it is never allowed to invent your policy.
              </p>
            </div>
            <div className="bg-ink p-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--chart)' }}>
                The language layer
              </div>
              <p className="mt-4 leading-relaxed" style={{ color: 'color-mix(in srgb, var(--paper) 78%, transparent)' }}>
                Gemini does what language models are actually good at: turning scanned PDFs
                into structured facts, and drafting the grievance letter — with each legal
                position cited to the IRDAI regulation it stands on.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— closing strip ——— */}
      <section aria-labelledby="cta" className="mx-auto max-w-shell px-8 py-16 flex flex-col items-start gap-6">
        <h2 id="cta" className="font-display font-semibold leading-tight" style={{ fontSize: 'clamp(28px, 3.4vw, 44px)' }}>
          Your claim is a document problem.{' '}
          <em>Solve it like one.</em>
        </h2>
        <button
          onClick={onOpen}
          className="rounded-full bg-ink px-7 py-3.5 font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-paper transition-transform duration-150 hover:-translate-y-0.5"
        >
          Open the readiness desk →
        </button>
        <p className="font-mono text-[11px] text-ink-3 max-w-xl leading-relaxed">
          Assistive analysis, not insurance or legal advice. Figures are estimates from the
          documents you provide; the insurer&apos;s computation is final.
        </p>
      </section>
    </main>
  )
}
