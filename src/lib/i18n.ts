/**
 * Internationalization (i18n) for the Swara Voice Check-in demo
 * Supports: English, French, German, Hindi (Devanagari)
 */

export type Language = "en" | "fr" | "de" | "hi";

export const LANGUAGE_OPTIONS: { id: Language; label: string; nativeLabel: string }[] = [
  { id: "en", label: "English", nativeLabel: "English" },
  { id: "fr", label: "French", nativeLabel: "Français" },
  { id: "de", label: "German", nativeLabel: "Deutsch" },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
];

type TranslationKey = keyof typeof translations;

const translations = {
  // Language selector
  selectLanguage: {
    en: "Select Your Language",
    fr: "Choisissez votre langue",
    de: "Wählen Sie Ihre Sprache",
    hi: "अपनी भाषा चुनें",
  },
  continueBtn: {
    en: "Continue",
    fr: "Continuer",
    de: "Weiter",
    hi: "जारी रखें",
  },

  // Chrome headers
  amplifierHealth: {
    en: "SWARA",
    fr: "SWARA",
    de: "SWARA",
    hi: "SWARA",
  },
  sonaVersion: {
    en: "SWARA // 2026",
    fr: "SWARA // 2026",
    de: "SWARA // 2026",
    hi: "SWARA // 2026",
  },

  // Triage - Step 1
  personalizeScreening: {
    en: "Let's personalize your screening.",
    fr: "Personnalisons votre bilan.",
    de: "Personalisieren wir Ihre Untersuchung.",
    hi: "आइए आपकी जांच को व्यक्तिगत बनाएं।",
  },
  male: {
    en: "Male",
    fr: "Homme",
    de: "Männlich",
    hi: "पुरुष",
  },
  female: {
    en: "Female",
    fr: "Femme",
    de: "Weiblich",
    hi: "महिला",
  },

  // Triage - Step 2
  selectAgeBracket: {
    en: "Select your age bracket.",
    fr: "Sélectionnez votre tranche d'âge.",
    de: "Wählen Sie Ihre Altersgruppe.",
    hi: "अपनी आयु वर्ग चुनें।",
  },

  // Triage - Step 3 (Health Focus)
  primaryHealthFocus: {
    en: "What is your primary health focus today?",
    fr: "Quelle est votre priorité santé aujourd'hui ?",
    de: "Was ist heute Ihr wichtigstes Gesundheitsthema?",
    hi: "आज आपका मुख्य स्वास्थ्य फोकस क्या है?",
  },

  // Triage - Step 4 (Contact)
  secureSession: {
    en: "Secure Your Session",
    fr: "Sécurisez votre session",
    de: "Sichern Sie Ihre Sitzung",
    hi: "अपना सत्र सुरक्षित करें",
  },
  consentDescription: {
    en: "To analyze your acoustic markers and generate your personalized screening results, we need to collect your consent.",
    fr: "Pour analyser vos marqueurs acoustiques et générer vos résultats personnalisés, nous avons besoin de votre consentement.",
    de: "Um Ihre akustischen Marker zu analysieren und Ihre persönlichen Ergebnisse zu erstellen, benötigen wir Ihre Zustimmung.",
    hi: "आपके ध्वनि मार्करों का विश्लेषण करने और आपके व्यक्तिगत जांच परिणाम उत्पन्न करने के लिए, हमें आपकी सहमति की आवश्यकता है।",
  },
  fullName: {
    en: "Full Name",
    fr: "Nom complet",
    de: "Vollständiger Name",
    hi: "पूरा नाम",
  },
  enterFullName: {
    en: "Enter your full name",
    fr: "Entrez votre nom complet",
    de: "Geben Sie Ihren vollständigen Namen ein",
    hi: "अपना पूरा नाम दर्ज करें",
  },
  emailAddress: {
    en: "Email Address",
    fr: "Adresse e-mail",
    de: "E-Mail-Adresse",
    hi: "ईमेल पता",
  },
  enterEmail: {
    en: "Enter your email address",
    fr: "Entrez votre adresse e-mail",
    de: "Geben Sie Ihre E-Mail-Adresse ein",
    hi: "अपना ईमेल पता दर्ज करें",
  },
  phoneNumber: {
    en: "Phone Number",
    fr: "Numéro de téléphone",
    de: "Telefonnummer",
    hi: "फ़ोन नंबर",
  },
  enterPhone: {
    en: "Enter your mobile number",
    fr: "Entrez votre numéro de mobile",
    de: "Geben Sie Ihre Mobilnummer ein",
    hi: "अपना मोबाइल नंबर दर्ज करें",
  },
  consentText: {
    en: "I consent to the recording and processing of my voice data for clinical screening and agree to the",
    fr: "Je consens à l'enregistrement et au traitement de mes données vocales à des fins de bilan clinique et j'accepte les",
    de: "Ich stimme der Aufzeichnung und Verarbeitung meiner Sprachdaten für die klinische Untersuchung zu und akzeptiere die",
    hi: "मैं नैदानिक जांच के लिए अपने आवाज डेटा की रिकॉर्डिंग और प्रसंस्करण के लिए सहमति देता/देती हूं और",
  },
  termsOfService: {
    en: "Terms of Service",
    fr: "Conditions d'utilisation",
    de: "Nutzungsbedingungen",
    hi: "सेवा की शर्तों",
  },
  and: {
    en: "and",
    fr: "et",
    de: "und",
    hi: "और",
  },
  privacyPolicy: {
    en: "Privacy Policy",
    fr: "Politique de confidentialité",
    de: "Datenschutzrichtlinie",
    hi: "गोपनीयता नीति",
  },
  beginScreening: {
    en: "BEGIN SCREENING",
    fr: "COMMENCER LE BILAN",
    de: "UNTERSUCHUNG STARTEN",
    hi: "जांच शुरू करें",
  },
  preparingSession: {
    en: "Preparing Session...",
    fr: "Préparation de la session...",
    de: "Sitzung wird vorbereitet...",
    hi: "सत्र तैयार हो रहा है...",
  },
  encryptionNote: {
    en: "Your data is fully encrypted using AES-256 healthcare-standard security.",
    fr: "Vos données sont entièrement chiffrées selon la norme de sécurité AES-256 pour le secteur de la santé.",
    de: "Ihre Daten sind vollständig mit dem AES-256-Gesundheitsstandard verschlüsselt.",
    hi: "आपका डेटा AES-256 स्वास्थ्य-मानक सुरक्षा का उपयोग करके पूरी तरह एन्क्रिप्ट किया गया है।",
  },

  // Validation errors
  nameRequired: {
    en: "Full name is required",
    fr: "Le nom complet est requis",
    de: "Der vollständige Name ist erforderlich",
    hi: "पूरा नाम आवश्यक है",
  },
  emailRequired: {
    en: "Please enter a valid email address.",
    fr: "Veuillez entrer une adresse e-mail valide.",
    de: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    hi: "कृपया एक मान्य ईमेल पता दर्ज करें।",
  },
  phoneRequired: {
    en: "Please enter a valid 10-digit phone number.",
    fr: "Veuillez entrer un numéro de téléphone valide à 10 chiffres.",
    de: "Bitte geben Sie eine gültige 10-stellige Telefonnummer ein.",
    hi: "कृपया एक मान्य 10-अंकीय फ़ोन नंबर दर्ज करें।",
  },

  // Attract / Orb
  wellnessCheck: {
    en: "Audio Wellness Check",
    fr: "Bilan de bien-être audio",
    de: "Audio-Wellness-Check",
    hi: "ऑडियो वेलनेस जांच",
  },
  tapToBegin: {
    en: "Tap Anywhere to Begin",
    fr: "Touchez n'importe où pour commencer",
    de: "Tippen Sie irgendwo, um zu beginnen",
    hi: "शुरू करने के लिए कहीं भी टैप करें",
  },

  // Recording / Capture — a pool of open, easy-to-talk-about prompts; getQuestions()
  // randomly samples 3 of these per session, each meant to draw out ~15-20s of natural speech.
  question1: {
    en: "Tell me about your favorite vacation — where you went, what you did, and why it stood out.",
    fr: "Parlez-moi de vos vacances préférées : où vous êtes allé, ce que vous avez fait, et pourquoi cela vous a marqué.",
    de: "Erzählen Sie mir von Ihrem Lieblingsurlaub: wohin Sie gereist sind, was Sie unternommen haben, und warum er Ihnen in Erinnerung geblieben ist.",
    hi: "अपनी पसंदीदा छुट्टी के बारे में बताएं: आप कहाँ गए, क्या किया, और वह खास क्यों थी।",
  },
  question2: {
    en: "Describe your favorite meal — what it is, what it tastes like, and why you love it.",
    fr: "Décrivez votre plat préféré : ce que c'est, son goût, et pourquoi vous l'aimez.",
    de: "Beschreiben Sie Ihr Lieblingsgericht: was es ist, wie es schmeckt, und warum Sie es lieben.",
    hi: "अपने पसंदीदा खाने के बारे में बताएं: वह क्या है, उसका स्वाद कैसा है, और आपको वह क्यों पसंद है।",
  },
  question3: {
    en: "Walk me through what you did today, from when you woke up until now.",
    fr: "Racontez-moi ce que vous avez fait aujourd'hui, depuis votre réveil jusqu'à maintenant.",
    de: "Erzählen Sie mir, was Sie heute gemacht haben, vom Aufwachen bis jetzt.",
    hi: "बताएं कि आपने आज क्या किया, सुबह उठने से लेकर अभी तक।",
  },
  question4: {
    en: "Tell me about members of your family: who they are, what they do, and what makes them unique.",
    fr: "Parlez-moi des membres de votre famille : qui ils sont, ce qu'ils font, et ce qui les rend uniques.",
    de: "Erzählen Sie mir von Ihren Familienmitgliedern: wer sie sind, was sie tun und was sie einzigartig macht.",
    hi: "अपने परिवार के सदस्यों के बारे में बताएं: वे कौन हैं, क्या करते हैं, और उनमें क्या खास बात है?",
  },
  question5: {
    en: "Describe a hobby or activity you genuinely enjoy and why it relaxes you.",
    fr: "Décrivez un loisir ou une activité que vous aimez vraiment et pourquoi cela vous détend.",
    de: "Beschreiben Sie ein Hobby oder eine Aktivität, die Ihnen wirklich Freude macht und warum sie Sie entspannt.",
    hi: "किसी ऐसे शौक या गतिविधि के बारे में बताएं जो आपको सच में पसंद है और वह आपको सुकून क्यों देती है।",
  },
  question6: {
    en: "Tell me about the most memorable trip you've ever taken.",
    fr: "Parlez-moi du voyage le plus mémorable que vous ayez jamais fait.",
    de: "Erzählen Sie mir von der denkwürdigsten Reise, die Sie je unternommen haben.",
    hi: "अपनी अब तक की सबसे यादगार यात्रा के बारे में बताएं।",
  },
  question7: {
    en: "Describe your ideal weekend, from morning to night.",
    fr: "Décrivez votre week-end idéal, du matin jusqu'au soir.",
    de: "Beschreiben Sie Ihr ideales Wochenende, vom Morgen bis zum Abend.",
    hi: "अपने आदर्श सप्ताहांत के बारे में बताएं, सुबह से रात तक।",
  },
  question8: {
    en: "Tell me about a movie or show you recently watched and what you thought of it.",
    fr: "Parlez-moi d'un film ou d'une série que vous avez regardé récemment et ce que vous en avez pensé.",
    de: "Erzählen Sie mir von einem Film oder einer Serie, die Sie kürzlich gesehen haben, und was Sie davon hielten.",
    hi: "किसी ऐसी फिल्म या शो के बारे में बताएं जो आपने हाल ही में देखा, और आपको कैसा लगा।",
  },
  question9: {
    en: "Describe your morning routine, step by step.",
    fr: "Décrivez votre routine matinale, étape par étape.",
    de: "Beschreiben Sie Ihre Morgenroutine, Schritt für Schritt.",
    hi: "अपनी सुबह की दिनचर्या के बारे में, चरण दर चरण बताएं।",
  },
  pressAndHold: {
    en: "Press and hold to record your answer",
    fr: "Appuyez et maintenez pour enregistrer votre réponse",
    de: "Halten Sie gedrückt, um Ihre Antwort aufzunehmen",
    hi: "अपना जवाब रिकॉर्ड करने के लिए दबाकर रखें",
  },
  clickToStart: {
    en: "Click here to start",
    fr: "Cliquez ici pour commencer",
    de: "Klicken Sie hier, um zu beginnen",
    hi: "शुरू करने के लिए यहां क्लिक करें",
  },
  recording: {
    en: "Recording...",
    fr: "Enregistrement...",
    de: "Aufnahme läuft...",
    hi: "रिकॉर्डिंग...",
  },
  releaseWhenDone: {
    en: "Release when done",
    fr: "Relâchez une fois terminé",
    de: "Loslassen, wenn fertig",
    hi: "पूरा होने पर छोड़ें",
  },
  clickWhenDone: {
    en: "Click when done",
    fr: "Cliquez une fois terminé",
    de: "Klicken Sie, wenn fertig",
    hi: "पूरा होने पर क्लिक करें",
  },
  nextQuestionIn: {
    en: "Next question in",
    fr: "Prochaine question dans",
    de: "Nächste Frage in",
    hi: "अगला प्रश्न",
  },
  completingIn: {
    en: "Completing in",
    fr: "Finalisation dans",
    de: "Abschluss in",
    hi: "पूर्ण हो रहा है",
  },
  pressRecordToAddMore: {
    en: "Press record to add more",
    fr: "Appuyez sur enregistrer pour ajouter plus",
    de: "Drücken Sie auf Aufnahme, um mehr hinzuzufügen",
    hi: "और जोड़ने के लिए रिकॉर्ड दबाएं",
  },
  processingResponses: {
    en: "Processing your responses...",
    fr: "Traitement de vos réponses...",
    de: "Ihre Antworten werden verarbeitet...",
    hi: "आपके जवाबों को संसाधित किया जा रहा है...",
  },
  questionOf: {
    en: "Question",
    fr: "Question",
    de: "Frage",
    hi: "प्रश्न",
  },
  of: {
    en: "of",
    fr: "sur",
    de: "von",
    hi: "का",
  },

  // Analysis
  analysisTitle: {
    en: "Running Voice Analysis",
    fr: "Analyse vocale en cours",
    de: "Sprachanalyse läuft",
    hi: "वॉइस विश्लेषण चल रहा है",
  },

  // Results - Negative (Cyan)
  negativeHeadline: {
    en: "NEGATIVE",
    fr: "NÉGATIF",
    de: "NEGATIV",
    hi: "नकारात्मक",
  },
  negativeResult: {
    en: "No clinical indicators detected.",
    fr: "Aucun indicateur clinique détecté.",
    de: "Keine klinischen Indikatoren festgestellt.",
    hi: "कोई नैदानिक संकेतक नहीं पाए गए।",
  },

  // Results - Positive (Amber)
  positiveHeadline: {
    en: "POSITIVE",
    fr: "POSITIF",
    de: "POSITIV",
    hi: "सकारात्मक",
  },
  positiveResult: {
    en: "Acoustic biomarkers suggest a need for follow-up. Please consult a healthcare provider.",
    fr: "Les biomarqueurs acoustiques suggèrent un suivi nécessaire. Veuillez consulter un professionnel de santé.",
    de: "Akustische Biomarker deuten auf eine Nachuntersuchung hin. Bitte wenden Sie sich an eine medizinische Fachkraft.",
    hi: "ध्वनि बायोमार्कर अनुवर्ती जांच का सुझाव देते हैं। कृपया किसी स्वास्थ्य सेवा प्रदाता से परामर्श करें।",
  },

  // Result page
  screeningResult: {
    en: "Wellness Check",
    fr: "Bilan de bien-être",
    de: "Wellness-Check",
    hi: "वेलनेस जांच",
  },
  basedOnVocalAnalysis: {
    en: "Based on vocal biomarker analysis",
    fr: "Basé sur l'analyse des biomarqueurs vocaux",
    de: "Basierend auf der Analyse vokaler Biomarker",
    hi: "आवाज बायोमार्कर विश्लेषण के आधार पर",
  },
  biometricResults: {
    en: "Biometric Results",
    fr: "Résultats biométriques",
    de: "Biometrische Ergebnisse",
    hi: "बायोमेट्रिक परिणाम",
  },
  biomarkerNote: {
    en: "Note: We analyze over 1,000 voice biomarkers. The markers shown here are a small subset that are easiest to interpret and most influential in your result.",
    fr: "Remarque : Nous analysons plus de 1 000 biomarqueurs vocaux. Les marqueurs présentés ici sont un petit sous-ensemble, les plus faciles à interpréter et les plus influents dans votre résultat.",
    de: "Hinweis: Wir analysieren über 1.000 stimmliche Biomarker. Die hier gezeigten Marker sind eine kleine Teilmenge, die am einfachsten zu interpretieren und für Ihr Ergebnis am einflussreichsten ist.",
    hi: "नोट: हम 1,000 से अधिक आवाज बायोमार्करों का विश्लेषण करते हैं। यहां दिखाए गए मार्कर एक छोटा उपसमूह हैं जो सबसे आसानी से समझे जा सकते हैं।",
  },
  standardMonitoring: {
    en: "Standard Monitoring",
    fr: "Surveillance standard",
    de: "Standardüberwachung",
    hi: "मानक निगरानी",
  },
  biomarkersOptimal: {
    en: "Your biomarkers are within optimal range",
    fr: "Vos biomarqueurs sont dans la plage optimale",
    de: "Ihre Biomarker liegen im optimalen Bereich",
    hi: "आपके बायोमार्कर इष्टतम सीमा में हैं",
  },
  setReminder: {
    en: "Set Reminder",
    fr: "Définir un rappel",
    de: "Erinnerung festlegen",
    hi: "रिमाइंडर सेट करें",
  },
  viewDetailedAnalysis: {
    en: "View Detailed Analysis →",
    fr: "Voir l'analyse détaillée →",
    de: "Detaillierte Analyse ansehen →",
    hi: "विस्तृत विश्लेषण देखें →",
  },
  startNewScreening: {
    en: "← Start New Screening",
    fr: "← Commencer un nouveau bilan",
    de: "← Neue Untersuchung starten",
    hi: "← नई जांच शुरू करें",
  },
  connectWithCare: {
    en: "Connect with Care",
    fr: "Se connecter avec un soignant",
    de: "Mit medizinischer Betreuung verbinden",
    hi: "स्वास्थ्य सेवा से जुड़ें",
  },
  requestSent: {
    en: "Request Sent",
    fr: "Demande envoyée",
    de: "Anfrage gesendet",
    hi: "अनुरोध भेजा गया",
  },
  clinicalReviewRecommended: {
    en: "CLINICAL REVIEW RECOMMENDED",
    fr: "EXAMEN CLINIQUE RECOMMANDÉ",
    de: "KLINISCHE ÜBERPRÜFUNG EMPFOHLEN",
    hi: "नैदानिक समीक्षा की सिफारिश",
  },
  requestConfirmed: {
    en: "REQUEST CONFIRMED",
    fr: "DEMANDE CONFIRMÉE",
    de: "ANFRAGE BESTÄTIGT",
    hi: "अनुरोध की पुष्टि",
  },
  careCoordinatorContact: {
    en: "A Care Coordinator from Harmonic Health will contact you within 24 hours.",
    fr: "Un coordinateur de soins de Harmonic Health vous contactera sous 24 heures.",
    de: "Ein Care Coordinator von Harmonic Health wird Sie innerhalb von 24 Stunden kontaktieren.",
    hi: "Harmonic Health से एक केयर कोऑर्डिनेटर 24 घंटे के भीतर आपसे संपर्क करेगा।",
  },
  audioQualityInsufficient: {
    en: "AUDIO QUALITY INSUFFICIENT",
    fr: "QUALITÉ AUDIO INSUFFISANTE",
    de: "AUDIOQUALITÄT UNZUREICHEND",
    hi: "ऑडियो गुणवत्ता अपर्याप्त",
  },
  recaptureAudioSample: {
    en: "Recapture Audio Sample",
    fr: "Reprendre l'échantillon audio",
    de: "Audioprobe erneut aufnehmen",
    hi: "ऑडियो नमूना फिर से लें",
  },

  // Step labels
  stepOf: {
    en: "Step",
    fr: "Étape",
    de: "Schritt",
    hi: "चरण",
  },

  // Navigation
  back: {
    en: "BACK",
    fr: "RETOUR",
    de: "ZURÜCK",
    hi: "पीछे",
  },

  // Analysis failed
  analysisFailed: {
    en: "Analysis could not be completed. Please try again.",
    fr: "L'analyse n'a pas pu être terminée. Veuillez réessayer.",
    de: "Die Analyse konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
    hi: "विश्लेषण पूरा नहीं हो सका। कृपया पुनः प्रयास करें।",
  },
  tryAgain: {
    en: "Try Again",
    fr: "Réessayer",
    de: "Erneut versuchen",
    hi: "पुनः प्रयास करें",
  },
} as const;

/**
 * Get translated string for the given key and language
 */
export function t(key: TranslationKey, lang: Language): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry.en;
}

const QUESTION_POOL_KEYS: TranslationKey[] = [
  "question1",
  "question2",
  "question3",
  "question4",
  "question5",
  "question6",
  "question7",
  "question8",
  "question9",
];

function shuffledQuestionKeys(): TranslationKey[] {
  const shuffled = [...QUESTION_POOL_KEYS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get a randomized set of 3 questions (no repeats) from the question pool, in the
 * given language. Each call reshuffles, so different sessions get different prompts.
 */
export function getQuestions(lang: Language): string[] {
  return shuffledQuestionKeys().slice(0, 3).map((key) => t(key, lang));
}

/**
 * Get the entire question pool, shuffled, translated. Used so a capture flow can
 * draw a fresh replacement question (one not already in use) if a recording didn't
 * capture enough speech and needs to be re-asked.
 */
export function getQuestionPool(lang: Language): string[] {
  return shuffledQuestionKeys().map((key) => t(key, lang));
}
