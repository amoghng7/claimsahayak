import type { CaseFile } from './types'
import type { Verdict } from './rules'
import { formatINR } from './format'

/**
 * Hindi (Devanagari) verdict summary — template-driven so the wording is
 * fixed and only the figures change. Font stack renders via
 * Noto Sans Devanagari / Tiro Devanagari Hindi.
 */
export function hindiSummary(c: CaseFile, v: Verdict): string[] {
  const lines: string[] = []

  const bandLine =
    v.band === 'strong'
      ? `आपका दावा मज़बूत है — तैयारी स्कोर ${v.score}/100। सभी ज़रूरी कागज़ात मौजूद हैं और पॉलिसी की शर्तों में कोई बड़ी रुकावट नहीं दिखती।`
      : v.band === 'fair'
        ? `आपका दावा फ़ाइल किया जा सकता है, लेकिन ध्यान दें — तैयारी स्कोर ${v.score}/100। दावा भेजने से पहले नीचे बताई गई कमियाँ दूर कर लें।`
        : `अभी दावा भेजना जोखिम भरा है — तैयारी स्कोर ${v.score}/100। पहले नीचे बताई गई समस्याएँ ठीक करें, वरना दावा खारिज हो सकता है।`
  lines.push(bandLine)

  const mandatory = v.missing.filter((m) => m.mandatory)
  if (mandatory.length > 0) {
    lines.push(
      `कागज़ात: ${mandatory.length} ज़रूरी दस्तावेज़ अभी नहीं हैं — ${mandatory
        .map((m) => m.label)
        .slice(0, 3)
        .join(', ')}${mandatory.length > 3 ? ' आदि' : ''}। इनके बिना दावा कतार में ही नहीं जाएगा।`,
    )
  } else {
    lines.push('कागज़ात: सभी ज़रूरी दस्तावेज़ पूरे हैं।')
  }

  if (v.roomRent) {
    lines.push(
      `कमरे का खर्च: पॉलिसी ${formatINR(v.roomRent.allowed)} प्रति दिन तक ही कमरा देती है, जबकि बिल में ${formatINR(v.roomRent.actual)} प्रति दिन है। इससे कमरे का किराया और उससे जुड़े खर्चों में कटौती होगी — कुल जोखिम ${formatINR(
        v.roomRent.roomCut + v.roomRent.proportionalCut,
      )} तक।`,
    )
  }

  if (v.waiting.length > 0) {
    lines.push(`प्रतीक्षा अवधि: ${v.waiting[0].label} पूरी नहीं हुई थी। इस आधार पर दावा खारिज होने की संभावना है।`)
  }

  lines.push(
    `अनुमानित भुगतान: ${formatINR(c.episode.totalBill)} के बिल में से लगभग ${formatINR(v.payable.expected)} मिलने की उम्मीद है (कटौतियों के बाद)।`,
  )

  lines.push('नोट: यह एक सहायक विश्लेषण है, बीमा या कानूनी सलाह नहीं। अंतिम निर्णय बीमा कंपनी का होता है।')

  return lines
}
