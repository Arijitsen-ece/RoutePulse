import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { SupportedLanguage, TransitSnapshot } from '../src/shared/types.ts';
import { verifyRouteServiceStatus } from '../src/shared/verificationEngine.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function askTransitAssistant(params: {
  question: string;
  language: SupportedLanguage;
  snapshot: TransitSnapshot;
}): Promise<{ answer: string; groundedRoutes: string[] }> {
  const { question, language, snapshot } = params;
  const ai = getGeminiClient();

  const langLabel =
    language === 'bn' ? 'Bengali (বাংলা)' : language === 'hi' ? 'Hindi (हिन्दी)' : 'English';

  const now = snapshot.serverTimestamp;
  const routeSummaries = snapshot.routes.map((r) => {
    const verification = verifyRouteServiceStatus({
      route: r,
      positions: snapshot.vehiclePositions,
      alerts: snapshot.serviceAlerts,
      reports: snapshot.passengerReports,
      tripUpdates: snapshot.tripUpdates,
      now,
    });
    const stopsText = r.stopSequence
      .map((s) => snapshot.stops.find((st) => st.stopId === s.stopId)?.name.en ?? s.stopId)
      .join(' -> ');
    return {
      routeNumber: r.routeNumber,
      origin: r.origin.en,
      destination: r.destination.en,
      operatingDays: r.operatingDays.join(', '),
      firstDeparture: r.firstDeparture,
      lastDeparture: r.lastDeparture,
      frequencyMin: r.frequencyMin,
      timetableBasis: r.timetableBasis,
      dataSource: r.dataSource,
      fareInr: `${r.fareMinInr}-${r.fareMaxInr}`,
      status: verification.status,
      freshnessState: verification.freshnessState,
      source: verification.source,
      explanation: verification.explanationDetail,
      stops: stopsText,
    };
  });

  const activeAlerts = snapshot.serviceAlerts
    .filter((a) => a.active)
    .map((a) => ({
      routeId: a.routeId,
      type: a.alertType,
      severity: a.severity,
      sourceType: a.sourceType,
      issuingOrganization: a.issuingOrganization,
      title: a.title[language] || a.title.en,
      description: a.description[language] || a.description.en,
    }));

  if (!ai) {
    return {
      answer:
        language === 'bn'
          ? 'এআই পরিবহন সহায়ক ব্যবহার করতে সার্ভার সেটিংসে GEMINI_API_KEY কনফিগার করুন। আপনি এখন সরাসরি রুট এক্সপ্লোরার এবং লাইভ ম্যাপ থেকে বাস খুঁজতে পারেন।'
          : language === 'hi'
            ? 'एआई परिवहन सहायक का उपयोग करने के लिए सर्वर में GEMINI_API_KEY कॉन्फ़िगर करें। आप रूट एक्सप्लोरर और लाइव मैप से बसें देख सकते हैं।'
            : 'Configure GEMINI_API_KEY in Settings > Secrets to enable the natural-language transport assistant. All routes, schedules, and verification statuses remain fully available in the Route Explorer and Journey Planner.',
      groundedRoutes: [],
    };
  }

  const systemInstruction = [
    `You are the RoutePulse Public Transport Assistant for Kolkata, West Bengal (an independent public transport application).`,
    `Respond strictly in ${langLabel}.`,
    `CRITICAL INTEGRITY RULES:`,
    `1. ONLY state routes, stops, schedules, fares, alerts, and verification statuses that appear in the provided AUTHORITATIVE_DATA JSON.`,
    `2. NEVER invent live GPS coordinates, bus numbers, official timetables, or confirm a bus is arriving if status is SCHEDULED, TRACKING_UNAVAILABLE, or UNVERIFIED.`,
    `3. Explicitly note when telemetry is Demonstration Telemetry (SYNTHETIC_DEMO) or when a route uses ESTIMATED_FREQUENCY instead of an official published timetable.`,
    `4. Remember: missing or stale GPS does NOT mean a bus is cancelled.`,
    `5. Keep responses concise, helpful, and structured in plain readable text (under 140 words).`,
  ].join('\n');

  const prompt = `PASSENGER QUESTION: ${question}\n\nAUTHORITATIVE_DATA:\n${JSON.stringify(
    {
      telemetryMode: snapshot.dataHealth.activeTelemetryMode,
      officialAlertFeedConnected: snapshot.dataHealth.officialAlertFeedConnected,
      routes: routeSummaries,
      activeAlerts,
    },
    null,
    2
  )}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const answer = (response.text ?? '').trim();
  const groundedRoutes = routeSummaries
    .filter((r) => answer.toLowerCase().includes(r.routeNumber.toLowerCase()))
    .map((r) => r.routeNumber);

  return {
    answer:
      answer ||
      'Unable to generate a transit summary right now. Please check the Route Explorer or Journey Planner.',
    groundedRoutes,
  };
}
