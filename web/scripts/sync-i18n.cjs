const fs = require('fs')
const path = require('path')

const enPath = path.join(__dirname, '../src/i18n/en.json')
const taPath = path.join(__dirname, '../src/i18n/ta.json')
const hiPath = path.join(__dirname, '../src/i18n/hi.json')

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'))
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'))

// Update copy in en
en.readingTitle = 'Reading your document'
en.stepReading = 'Reading your document'
ta.readingTitle = 'உங்கள் ஆவணத்தைப் படிக்கிறது'
ta.stepReading = 'உங்கள் ஆவணத்தைப் படிக்கிறது'
hi.readingTitle = 'दस्तावेज़ पढ़ रहे हैं'
hi.stepReading = 'दस्तावेज़ पढ़ रहे हैं'

const newKeys = {
  reassuranceText: {
    en: 'Still reading... Documents with complex tables or multiple pages take a little longer',
    ta: 'தொடர்ந்து படிக்கிறது... சிக்கலான அட்டவணைகள் அல்லது பல பக்கங்கள் கொண்ட ஆவணங்கள் சிறிது கூடுதல் நேரம் எடுக்கும்',
    hi: 'अभी भी पढ़ रहे हैं... जटिल तालिकाओं या कई पृष्ठों वाले दस्तावेज़ों में थोड़ा अधिक समय लगता है',
    te: 'ఇంకా చదువుతోంది... సంక్లిష్ట పట్టికలు లేదా బహుళ పేజీలు ఉన్న పత్రాలకు కొంచెం ఎక్కువ సమయం పడుతుంది',
    ml: 'വായിച്ചുകൊണ്ടിരിക്കുന്നു... സങ്കീർണ്ണമായ പട്ടികകളോ ഒന്നിലധികം പേജുകളോ ഉള്ള പ്രമാണങ്ങൾക്ക് കുറച്ചുകൂടി സമയം എടുത്തേക്കാം',
    kn: 'ಇನ್ನೂ ಓದಲಾಗುತ್ತಿದೆ... ಸಂಕೀರ್ಣ ಕೋಷ್ಟಕಗಳು ಅಥವಾ ಬಹು ಪುಟಗಳನ್ನು ಹೊಂದಿರುವ ದಾಖಲೆಗಳಿಗೆ ಸ್ವಲ್ಪ ಹೆಚ್ಚು ಸಮಯ ಬೇಕಾಗುತ್ತದೆ',
  },
  autoDetect: {
    en: 'Auto (Detect)',
    ta: 'தானியங்கு (கண்டறி)',
    hi: 'ऑटो (पहचानें)',
    te: 'ఆటో (గుర్తించు)',
    ml: 'ഓട്ടോ (തിരിച്ചറിയുക)',
    kn: 'ಆಟೋ (ಗುರುತಿಸಿ)',
  },
  docInLanguage: {
    en: 'Document is in {lang}',
    ta: 'ஆவணம் {lang} மொழியில் உள்ளது',
    hi: 'दस्तावेज़ {lang} में है',
    te: 'పత్రం {lang} లో ఉంది',
    ml: 'പ്രമാണം {lang} ഭാഷയിലാണ്',
    kn: 'ದಾಖಲೆಯು {lang} ನಲ್ಲಿದೆ',
  },
  reReadInLang: {
    en: 'Re-read in {lang} (details may differ slightly)',
    ta: '{lang} மொழியில் மீண்டும் படிக்கப்பட்டது (விவரங்கள் சற்று மாறுபடலாம்)',
    hi: '{lang} में पुनः पढ़ा गया (विवरण थोड़ा भिन्न हो सकते हैं)',
    te: '{lang} లో మళ్లీ చదవబడింది (వివరాలు కొద్దిగా మారవచ్చు)',
    ml: '{lang}-ൽ വീണ്ടും വായിച്ചു (വിവരങ്ങൾ ചെറുതായി വ്യത്യാസപ്പെടാം)',
    kn: '{lang} ನಲ್ಲಿ ಮತ್ತೆ ಓದಲಾಗಿದೆ (ವಿವರಗಳು ಸ್ವಲ್ಪ ಬದಲಾಗಬಹುದು)',
  },
  translateFailBanner: {
    en: "Couldn't translate to {lang}. Showing English.",
    ta: '{lang} மொழிக்கு மொழிபெயர்க்க முடியவில்லை. ஆங்கிலத்தில் காட்டப்படுகிறது.',
    hi: '{lang} में अनुवाद नहीं किया जा सका. अंग्रेज़ी दिखाई जा रही है.',
    te: '{lang} లోకి అనువదించలేకపోయాము. ఇంగ్లీష్ చూపిస్తున్నాము.',
    ml: '{lang}-ലേക്ക് വിവർത്തനം ചെയ്യാനായില്ല. ഇംഗ്ലീഷ് കാണിക്കുന്നു.',
    kn: '{lang} ಗೆ ಅನುವಾದಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಇಂಗ್ಲಿಷ್ ತೋರಿಸಲಾಗುತ್ತಿದೆ.',
  },
  atAGlance: {
    en: 'At a glance',
    ta: 'ஒரு பார்வையில்',
    hi: 'एक नज़र में',
    te: 'ఒక్క చూపులో',
    ml: 'ഒറ്റനോട്ടത്തിൽ',
    kn: 'ಒಂದು ನೋಟದಲ್ಲಿ',
  },
  showAll: {
    en: 'Show all ({count})',
    ta: 'அனைத்தையும் காட்டு ({count})',
    hi: 'सभी दिखाएं ({count})',
    te: 'అన్నీ చూపించు ({count})',
    ml: 'എല്ലാം കാണിക്കുക ({count})',
    kn: 'ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ ({count})',
  },
  showLess: {
    en: 'Show less',
    ta: 'குறைவாகக் காட்டு',
    hi: 'कम दिखाएं',
    te: 'తక్కువ చూపించు',
    ml: 'കുറച്ച് കാണിക്കുക',
    kn: 'ಕಡಿಮೆ ತೋರಿಸಿ',
  },
  places: {
    en: 'Places',
    ta: 'இடங்கள்',
    hi: 'स्थान',
    te: 'ప్రదేశాలు',
    ml: 'സ്ഥലങ്ങൾ',
    kn: 'ಸ್ಥಳಗಳು',
  },
  contacts: {
    en: 'Contacts',
    ta: 'தொடர்புகள்',
    hi: 'संपर्क',
    te: 'పరిచయాలు',
    ml: 'ബന്ധപ്പെടാനുള്ള വിവരങ്ങൾ',
    kn: 'ಸಂಪರ್ಕಗಳು',
  },
  openInMaps: {
    en: 'Open in Maps',
    ta: 'வரைபடத்தில் திற',
    hi: 'मैप्स में खोलें',
    te: 'మ్యాప్స్‌లో తెరవండి',
    ml: 'മാപ്പിൽ തുറക്കുക',
    kn: 'ಮ್ಯಾಪ್ಸ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ',
  },
  directions: {
    en: 'Directions',
    ta: 'வழிகாட்டுதல்',
    hi: 'दिशा-निर्देश',
    te: 'దిశలు',
    ml: 'ദിശകൾ',
    kn: 'ದಿಕ್ಕುಗಳು',
  },
  showMap: {
    en: 'Show map',
    ta: 'வரைபடத்தைக் காட்டு',
    hi: 'मानचित्र दिखाएं',
    te: 'మ్యాప్ చూపించు',
    ml: 'മാപ്പ് കാണിക്കുക',
    kn: 'ಮ್ಯಾಪ್ ತೋರಿಸಿ',
  },
  hideMap: {
    en: 'Hide map',
    ta: 'வரைபடத்தை மறை',
    hi: 'मानचित्र छिपाएं',
    te: 'మ్యాప్ దాచు',
    ml: 'മാപ്പ് മറയ്ക്കുക',
    kn: 'ಮ್ಯಾಪ್ ಮರೆಮಾಡಿ',
  },
  call: {
    en: 'Call',
    ta: 'அழைக்கவும்',
    hi: 'कॉल करें',
    te: 'కాల్ చేయండి',
    ml: 'വിളിക്കുക',
    kn: 'ಕರೆ ಮಾಡಿ',
  },
  email: {
    en: 'Email',
    ta: 'மின்னஞ்சல்',
    hi: 'ईमेल',
    te: 'ఇమెయిల్',
    ml: 'ഇമെയിൽ',
    kn: 'ಇಮೇಲ್',
  },
  addToCalendar: {
    en: 'Add to calendar',
    ta: 'நாட்காட்டியில் சேர்க்கவும்',
    hi: 'कैलेंडर में जोड़ें',
    te: 'క్యాలెండర్‌కు జోడించండి',
    ml: 'കലണ്ടറിലേക്ക് ചേർക്കുക',
    kn: 'ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ',
  },
  addAllDates: {
    en: 'Add all dates',
    ta: 'அனைத்து தேதிகளையும் சேர்க்கவும்',
    hi: 'सभी तारीखें जोड़ें',
    te: 'అన్ని తేదీలను జోడించండి',
    ml: 'എല്ലാ തീയതികളും ചേർക്കുക',
    kn: 'ಎಲ್ಲಾ ದಿನಾಂಕಗಳನ್ನು ಸೇರಿಸಿ',
  },
  addToGoogleCalendar: {
    en: 'Add to Google Calendar',
    ta: 'கூகுள் காலெண்டரில் சேர்க்கவும்',
    hi: 'गूगल कैलेंडर में जोड़ें',
    te: 'గూగుల్ క్యాలెండర్‌కు జోడించండి',
    ml: 'ഗൂഗിൾ കലണ്ടറിലേക്ക് ചേർക്കുക',
    kn: 'ಗೂಗಲ್ ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ',
  },
  calendarDefaultAlertNote: {
    en: 'Alerts use your calendar defaults',
    ta: 'அறிவிப்புகள் உங்கள் காலெண்டர் அமைப்புகளைப் பயன்படுத்தும்',
    hi: 'अलर्ट आपके कैलेंडर डिफॉल्ट का उपयोग करते हैं',
    te: 'హెచ్చరికలు మీ క్యాలెండర్ డిఫాల్ట్‌లను ఉపయోగిస్తాయి',
    ml: 'അലേർട്ടുകൾ നിങ്ങളുടെ കലണ്ടർ ഡിഫോൾട്ടുകൾ ഉപയോഗിക്കുന്നു',
    kn: 'ಎಚ್ಚರಿಕೆಗಳು ನಿಮ್ಮ ಕ್ಯಾಲೆಂಡರ್ ಡೀಫಾಲ್ಟ್‌ಗಳನ್ನು ಬಳಸುತ್ತವೆ',
  },
  medicineReminders: {
    en: 'Medicine reminders',
    ta: 'மருந்து நினைவூட்டல்கள்',
    hi: 'दवा अनुस्मारक',
    te: 'మందుల రిమైండర్లు',
    ml: 'മരുന്ന് ഓർമ്മപ്പെടുത്തലുകൾ',
    kn: 'ಔಷಧಿ ಜ್ಞಾಪನೆಗಳು',
  },
  medicineCheckWarning: {
    en: 'Check these against your prescription before adding',
    ta: 'சேர்ப்பதற்கு முன் உங்கள் மருத்துவ சீட்டுடன் சரிபார்க்கவும்',
    hi: 'जोड़ने से पहले अपने पर्चे से इनकी जांच करें',
    te: 'జోడించే ముందు మీ ప్రిస్క్రిప్షన్‌తో సరిచూసుకోండి',
    ml: 'ചേർക്കുന്നതിന് മുമ്പ് നിങ്ങളുടെ കുറിപ്പടിയുമായി ഒത്തുനോക്കുക',
    kn: 'ಸೇರಿಸುವ ಮೊದಲು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ನೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ',
  },
  takeOnlyWhenNeeded: {
    en: 'Take only when needed, no reminder',
    ta: 'தேவைப்படும்போது மட்டும் உட்கொள்ளவும், நினைவூட்டல் இல்லை',
    hi: 'केवल आवश्यकता पड़ने पर लें, कोई अनुस्मारक नहीं',
    te: 'అవసరమైనప్పుడు మాత్రమే తీసుకోండి, రిమైండర్ లేదు',
    ml: 'ആവശ്യമുള്ളപ്പോൾ മാത്രം കഴിക്കുക, ഓർമ്മപ്പെടുത്തലില്ല',
    kn: 'ಅಗತ್ಯವಿದ್ದಾಗ ಮಾತ್ರ ತೆಗೆದುಕೊಳ್ಳಿ, ಜ್ಞಾಪನೆ ಇಲ್ಲ',
  },
  chooseDuration: {
    en: 'Choose duration (days):',
    ta: 'கால அளவைத் தேர்ந்தெடுக்கவும் (நாட்கள்):',
    hi: 'अवधि चुनें (दिन):',
    te: 'వ్యవధిని ఎంచుకోండి (రోజులు):',
    ml: 'കാലാവധി തിരഞ്ഞെടുക്കുക (ദിവസങ്ങൾ):',
    kn: 'ಅವಧಿಯನ್ನು ಆರಿಸಿ (ದಿನಗಳು):',
  },
  addReminders: {
    en: 'Add reminders',
    ta: 'நினைவூட்டல்களைச் சேர்',
    hi: 'अनुस्मारक जोड़ें',
    te: 'రిమైండర్‌లను జోడించండి',
    ml: 'ഓർമ്മപ്പെടുത്തലുകൾ ചേർക്കുക',
    kn: 'ಜ್ಞಾಪನೆಗಳನ್ನು ಸೇರಿಸಿ',
  },
  beforeFood: {
    en: 'Before food',
    ta: 'உணவுக்கு முன்',
    hi: 'भोजन से पहले',
    te: 'భోజనానికి ముందు',
    ml: 'ഭക്ഷണത്തിന് മുമ്പ്',
    kn: 'ಊಟಕ್ಕೆ ಮುಂಚೆ',
  },
  afterFood: {
    en: 'After food',
    ta: 'உணவுக்குப் பின்',
    hi: 'भोजन के बाद',
    te: 'భోజనం తర్వాత',
    ml: 'ഭക്ഷണത്തിന് ശേഷം',
    kn: 'ಊಟದ ನಂತರ',
  },
  slotMorning: {
    en: 'Morning (8:00 AM)',
    ta: 'காலை (8:00)',
    hi: 'सुबह (8:00)',
    te: 'ఉదయం (8:00)',
    ml: 'രാവിലെ (8:00)',
    kn: 'ಬೆಳಿಗ್ಗೆ (8:00)',
  },
  slotAfternoon: {
    en: 'Afternoon (2:00 PM)',
    ta: 'மதியம் (14:00)',
    hi: 'दोपहर (14:00)',
    te: 'మధ్యాహ్నం (14:00)',
    ml: 'ഉച്ചയ്ക്ക് (14:00)',
    kn: 'ಮಧ್ಯಾಹ್ನ (14:00)',
  },
  slotEvening: {
    en: 'Evening (6:00 PM)',
    ta: 'மாலை (18:00)',
    hi: 'शाम (18:00)',
    te: 'సాయంత్రం (18:00)',
    ml: 'വൈകുന്നേരം (18:00)',
    kn: 'ಸಂಜೆ (18:00)',
  },
  slotNight: {
    en: 'Night (9:00 PM)',
    ta: 'இரவு (21:00)',
    hi: 'रात (21:00)',
    te: 'రాత్రి (21:00)',
    ml: 'രാത്രി (21:00)',
    kn: 'ರಾತ್ರಿ (21:00)',
  },
  slotBedtime: {
    en: 'Bedtime (10:00 PM)',
    ta: 'தூங்கும் முன் (22:00)',
    hi: 'सोते समय (22:00)',
    te: 'పడుకునే ముందు (22:00)',
    ml: 'ഉറങ്ങുന്നതിന് മുമ്പ് (22:00)',
    kn: 'ಮಲಗುವ ಮುನ್ನ (22:00)',
  },
  slotAsNeeded: {
    en: 'As needed',
    ta: 'தேவைக்கேற்ப',
    hi: 'आवश्यकतानुसार',
    te: 'అవసరాన్ని బట్టి',
    ml: 'ആവശ്യാനുസരണം',
    kn: 'ಅಗತ್ಯವಿದ್ದಾಗ',
  },
  quickSummary: {
    en: 'Quick summary',
    ta: 'சுருக்கம்',
    hi: 'त्वरित सारांश',
    te: 'త్వరిత సారాంశం',
    ml: 'ചുരുക്കം',
    kn: 'ತ್ವರಿತ ಸಾರಾಂಶ',
  },
  fullDetails: {
    en: 'Full details',
    ta: 'முழு விவரங்கள்',
    hi: 'पूर्ण विवरण',
    te: 'పూర్తి వివరాలు',
    ml: 'പൂർണ്ണ വിവരങ്ങൾ',
    kn: 'ಪೂರ್ಣ ವಿವರಗಳು',
  },
  usingDeviceVoice: {
    en: 'Using device voice',
    ta: 'சாதனக் குரலைப் பயன்படுத்துகிறது',
    hi: 'डिवाइस की आवाज़ का उपयोग किया जा रहा है',
    te: 'పరికరం స్వరాన్ని ఉపయోగిస్తోంది',
    ml: 'ഉപകരണ ശബ്ദം ഉപയോഗിക്കുന്നു',
    kn: 'ಸಾಧನದ ಧ್ವನಿಯನ್ನು ಬಳಸಲಾಗುತ್ತಿದೆ',
  },
  voiceFemale: {
    en: 'Female',
    ta: 'பெண்',
    hi: 'महिला',
    te: 'మహిళ',
    ml: 'സ്ത്രീ',
    kn: 'ಮಹಿಳೆ',
  },
  voiceMale: {
    en: 'Male',
    ta: 'ஆண்',
    hi: 'पुरुष',
    te: 'పురుషుడు',
    ml: 'പുരുഷൻ',
    kn: 'ಪುರುಷ',
  },
  speed: {
    en: 'Speed',
    ta: 'வேகம்',
    hi: 'गति',
    te: 'వేగం',
    ml: 'വേഗത',
    kn: 'ವೇಗ',
  },
  replay10s: {
    en: 'Replay 10s',
    ta: '10 விநாடிகள் பின்னே',
    hi: '10 सेकंड पीछे',
    te: '10 సెకన్లు వెనుకకు',
    ml: '10 സെക്കൻഡ് പിന്നോട്ട്',
    kn: '10 ಸೆಕೆಂಡುಗಳ ಹಿಂದೆ',
  },
  makeEasierToRead: {
    en: 'Make it easier to read',
    ta: 'வாசிப்பை எளிதாக்கு',
    hi: 'पढ़ना आसान बनाएं',
    te: 'చదవడాన్ని సులభతరం చేయండి',
    ml: 'വായിക്കാൻ എളുപ്പമാക്കുക',
    kn: 'ಓದುವುದನ್ನು ಸುಲಭಗೊಳಿಸಿ',
  },
  textSize: {
    en: 'Text size',
    ta: 'எழுத்து அளவு',
    hi: 'टेक्स्ट का आकार',
    te: 'వచన పరిమాణం',
    ml: 'ടെക്സ്റ്റ് വലുപ്പം',
    kn: 'ಪಠ್ಯದ ಗಾತ್ರ',
  },
  lineSpacing: {
    en: 'Line spacing',
    ta: 'வரி இடைவெளி',
    hi: 'पंक्ति रिक्ति',
    te: 'వరుసల అంతరం',
    ml: 'വരികളുടെ അകലം',
    kn: 'ಸಾಲುಗಳ ಅಂತರ',
  },
  lineSpacingNormal: {
    en: 'Normal',
    ta: 'சாதாரணம்',
    hi: 'सामान्य',
    te: 'సాధారణ',
    ml: 'സാധാരണ',
    kn: 'ಸಾಮಾನ್ಯ',
  },
  lineSpacingRelaxed: {
    en: 'Relaxed',
    ta: 'அதிக இடைவெளி',
    hi: 'आरामदायक',
    te: 'సడలించిన',
    ml: 'കൂടുതൽ അകലം',
    kn: 'ಹೆಚ್ಚಿನ ಅಂತರ',
  },
  easyReadMode: {
    en: 'Easier-to-read mode (cleaner fonts & spacing)',
    ta: 'எளிதாக வாசிக்கும் முறை',
    hi: 'आसान पठन मोड',
    te: 'సులభంగా చదివే మోడ్',
    ml: 'എളുപ്പത്തിൽ വായിക്കാനുള്ള മോഡ്',
    kn: 'ಸುಲಭವಾಗಿ ಓದುವ ಮೋಡ್',
  },
  highContrast: {
    en: 'High contrast',
    ta: 'அதிக மாறுபாடு (High contrast)',
    hi: 'उच्च कंट्रास्ट',
    te: 'అధిక కాంట్రాస్ట్',
    ml: 'ഉയർന്ന കോൺട്രാസ്റ്റ്',
    kn: 'ಹೆಚ್ಚಿನ ಕಾಂಟ್ರಾಸ್ಟ್',
  },
  reduceMotion: {
    en: 'Reduce motion',
    ta: 'அசைவுகளைக் குறைக்கவும்',
    hi: 'मोशन कम करें',
    te: 'కదలికను తగ్గించండి',
    ml: 'ചലനം കുറയ്ക്കുക',
    kn: 'ಚಲನೆಯನ್ನು ಕಡಿಮೆ ಮಾಡಿ',
  },
  largerTapTargets: {
    en: 'Larger tap targets',
    ta: 'பெரிய தொடு பொத்தான்கள்',
    hi: 'बड़े बटन',
    te: 'పెద్ద బటన్లు',
    ml: 'വലിയ ബട്ടണുകൾ',
    kn: 'ದೊಡ್ಡ ಬಟನ್‌ಗಳು',
  },
  preview: {
    en: 'Preview',
    ta: 'முன்னோட்டம்',
    hi: 'पूर्वावलोकन',
    te: 'ప్రివ్యూ',
    ml: 'പ്രിവ്യൂ',
    kn: 'ಮುನ್ನೋಟ',
  },
  reset: {
    en: 'Reset',
    ta: 'மீட்டமை',
    hi: 'रीसेट करें',
    te: 'రీసెట్ చేయండి',
    ml: 'റീസെറ്റ് ചെയ്യുക',
    kn: 'ಮರುಹೊಂದಿಸಿ',
  },
  passwordRequiredTitle: {
    en: 'This PDF is password protected',
    ta: 'இந்த PDF கடவுச்சொல் மூலம் பாதுகாக்கப்பட்டுள்ளது',
    hi: 'यह पीडीएफ पासवर्ड से सुरक्षित है',
    te: 'ఈ PDF పాస్‌వర్డ్‌తో రక్షించబడింది',
    ml: 'ഈ PDF പാസ്‌വേഡ് ഉപയോഗിച്ച് പരിരക്ഷിച്ചിരിക്കുന്നു',
    kn: 'ಈ PDF ಪಾಸ್‌ವರ್ಡ್‌ನಿಂದ ರಕ್ಷಿಸಲ್ಪಟ್ಟಿದೆ',
  },
  passwordRequiredDesc: {
    en: 'Enter the password to read this document.',
    ta: 'இந்த ஆவணத்தைப் படிக்க கடவுச்சொல்லை உள்ளிடவும்.',
    hi: 'इस दस्तावेज़ को पढ़ने के लिए पासवर्ड दर्ज करें.',
    te: 'ఈ పత్రాన్ని చదవడానికి పాస్‌వర్డ్‌ను నమోదు చేయండి.',
    ml: 'ഈ പ്രമാണം വായിക്കാൻ പാസ്‌വേഡ് നൽകുക.',
    kn: 'ಈ ದಾಖಲೆಯನ್ನು ಓದಲು ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ.',
  },
  passwordPlaceholder: {
    en: 'Enter password',
    ta: 'கடவுச்சொல்லை உள்ளிடவும்',
    hi: 'पासवर्ड दर्ज करें',
    te: 'పాస్‌వర్డ్ నమోదు చేయండి',
    ml: 'പാസ്‌വേഡ് നൽകുക',
    kn: 'ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ',
  },
  unlock: {
    en: 'Unlock',
    ta: 'திறக்கவும்',
    hi: 'अनलॉक करें',
    te: 'అన్‌లాక్ చేయండి',
    ml: 'അൺലോക്ക് ചെയ്യുക',
    kn: 'ಅನ್‌ಲಾಕ್ ಮಾಡಿ',
  },
  skip: {
    en: 'Skip',
    ta: 'தவிர்',
    hi: 'छोड़ें',
    te: 'దాటవేయి',
    ml: 'ഒഴിവാക്കുക',
    kn: 'ಬಿಟ್ಟುಬಿಡಿ',
  },
  askPlaceholder: {
    en: 'Ask anything about this document...',
    ta: 'இந்த ஆவணம் பற்றி எதுவும் கேளுங்கள்...',
    hi: 'इस दस्तावेज़ के बारे में कुछ भी पूछें...',
    te: 'ఈ పత్రం గురించి ఏదైనా అడగండి...',
    ml: 'ഈ പ്രമാണത്തെക്കുറിച്ച് എന്തെങ്കിലും ചോദിക്കുക...',
    kn: 'ಈ ದಾಖಲೆಯ ಬಗ್ಗೆ ಏನನ್ನಾದರೂ ಕೇಳಿ...',
  },
  askChip1: {
    en: 'What do I need to pay?',
    ta: 'நான் என்ன செலுத்த வேண்டும்?',
    hi: 'मुझे क्या भुगतान करना है?',
    te: 'నేను ఎంత చెల్లించాలి?',
    ml: 'ഞാൻ എന്താണ് നൽകേണ്ടത്?',
    kn: 'ನಾನು ಎಷ್ಟು ಪಾವತಿಸಬೇಕು?',
  },
  askChip2: {
    en: 'When is the deadline?',
    ta: 'கடைசி தேதி எப்போது?',
    hi: 'अंतिम तिथि कब है?',
    te: 'గడువు ఎప్పుడు?',
    ml: 'അവസാന തീയതി എപ്പോഴാണ്?',
    kn: 'ಅಂತಿಮ ದಿನಾಂಕ ಯಾವಾಗ?',
  },
  askChip3: {
    en: 'Who do I contact?',
    ta: 'நான் யாரைத் தொடர்பு கொள்ள வேண்டும்?',
    hi: 'मैं किससे संपर्क करूं?',
    te: 'నేను ఎవరిని సంప్రదించాలి?',
    ml: 'ഞാൻ ആരെയാണ് ബന്ധപ്പെടേണ്ടത്?',
    kn: 'ನಾನು ಯಾರನ್ನು ಸಂಪರ್ಕಿಸಬೇಕು?',
  },
  askAnsweredFromSummary: {
    en: 'Answering from the summary',
    ta: 'சுருக்கத்திலிருந்து பதிலளிக்கப்படுகிறது',
    hi: 'सारांश से उत्तर दिया जा रहा है',
    te: 'సారాంశం నుండి సమాధానం ఇస్తోంది',
    ml: 'സംഗ്രഹത്തിൽ നിന്ന് ഉത്തരം നൽകുന്നു',
    kn: 'ಸಾರಾಂಶದಿಂದ ಉತ್ತರಿಸಲಾಗುತ್ತಿದೆ',
  },
  askNotFound: {
    en: "This document doesn't say",
    ta: 'இந்த ஆவணத்தில் இந்த தகவல் குறிப்பிடப்படவில்லை',
    hi: 'यह दस्तावेज़ यह नहीं बताता है',
    te: 'ఈ పత్రం చెప్పడం లేదు',
    ml: 'ഈ പ്രമാണത്തിൽ ഇത് പറയുന്നില്ല',
    kn: 'ಈ ದಾಖಲೆಯಲ್ಲಿ ಹೇಳಲಾಗಿಲ್ಲ',
  },
  askUnverified: {
    en: "I couldn't verify an answer. Check the original.",
    ta: 'பதிலை சரிபார்க்க முடியவில்லை. அசல் ஆவணத்தைப் பார்க்கவும்.',
    hi: 'मैं उत्तर सत्यापित नहीं कर सका. मूल दस्तावेज़ की जाँच करें.',
    te: 'సమాధానాన్ని ధృవీకరించలేకపోయాము. అసలు పత్రాన్ని చూడండి.',
    ml: 'ഉത്തരം പരിശോധിക്കാനായില്ല. യഥാർത്ഥ പ്രമാണം പരിശോധിക്കുക.',
    kn: 'ಉತ್ತರವನ್ನು ಪರಿಶೀಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮೂಲ ದಾಖಲೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.',
  },
  trySample: {
    en: 'Try a sample',
    ta: 'மாதிரி ஆவணத்தை முயற்சிக்கவும்',
    hi: 'नमूना दस्तावेज़ आज़माएं',
    te: 'నమూనా పత్రాన్ని ప్రయత్నించండి',
    ml: 'ഒരു സാമ്പിൾ പരീക്ഷിക്കുക',
    kn: 'ಮಾದರಿಯನ್ನು ಪ್ರಯತ್ನಿಸಿ',
  },
  samplePension: {
    en: 'Pension notice (Photo)',
    ta: 'ஓய்வூதிய அறிவிப்பு (புகைப்படம்)',
    hi: 'पेंशन नोटिस (फ़ोटो)',
    te: 'పెన్షన్ నోటీసు (ఫోటో)',
    ml: 'പെൻഷൻ അറിയിപ്പ് (ഫോട്ടോ)',
    kn: 'ಪಿಂಚಣಿ ಸೂಚನೆ (ಫೋಟೋ)',
  },
  sampleInsurance: {
    en: 'Insurance letter (PDF)',
    ta: 'காப்பீட்டு கடிதம் (PDF)',
    hi: 'बीमा पत्र (PDF)',
    te: 'భీమా లేఖ (PDF)',
    ml: 'ഇൻഷുറൻസ് കത്ത് (PDF)',
    kn: 'ವಿಮಾ ಪತ್ರ (PDF)',
  },
  sampleLab: {
    en: 'Lab report (PDF)',
    ta: 'ஆய்வக அறிக்கை (PDF)',
    hi: 'लैब रिपोर्ट (PDF)',
    te: 'ల్యాబ్ రిపోర్ట్ (PDF)',
    ml: 'ലാബ് റിപ്പോർട്ട് (PDF)',
    kn: 'ಲ್ಯಾಬ್ ವರದಿ (PDF)',
  },
  nextUp: {
    en: 'Next up',
    ta: 'அடுத்த நடவடிக்கை',
    hi: 'अगला कार्य',
    te: 'తదుపరి కార్యం',
    ml: 'അടുത്തത്',
    kn: 'ಮುಂದಿನ ಕೆಲಸ',
  },
  offlineNotice: {
    en: "You're offline: saved results still open, scanning needs internet",
    ta: 'இணைய இணைப்பு இல்லை: சேமிக்கப்பட்ட முடிவுகள் திறக்கும், ஸ்கேன் செய்ய இணையம் தேவை',
    hi: 'आप ऑफ़लाइन हैं: सहेजे गए परिणाम खुलेंगे, स्कैनिंग के लिए इंटरनेट चाहिए',
    te: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు: సేవ్ చేసిన ఫలితాలు పనిచేస్తాయి, స్కాన్ చేయడానికి ఇంటర్నెట్ అవసరం',
    ml: 'നിങ്ങൾ ഓഫ്‌ലൈനിലാണ്: സേവ് ചെയ്ത ഫലങ്ങൾ തുറക്കും, സ്കാനിംഗിന് ഇൻ്റർനെറ്റ് ആവശ്യമാണ്',
    kn: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ: ಉಳಿಸಿದ ಫಲಿತಾಂಶಗಳು ತೆರೆಯುತ್ತವೆ, ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಇಂಟರ್ನೆಟ್ ಬೇಕು',
  },
  fileTooLarge: {
    en: 'File too large. Max 25 MB.',
    ta: 'கோப்பு மிகவும் பெரியது. அதிகபட்சம் 25 எம்பி.',
    hi: 'फ़ाइल बहुत बड़ी है. अधिकतम 25 एमबी.',
    te: 'ఫైల్ చాలా పెద్దది. గరిష్టంగా 25 MB.',
    ml: 'ഫയൽ വളരെ വലുതാണ്. പരമാവധി 25 MB.',
    kn: 'ಫೈಲ್ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಗರಿಷ್ಠ 25 MB.',
  },
  unsupportedType: {
    en: 'Unsupported file format. Please use PDF, JPG or PNG.',
    ta: 'ஆதரிக்கப்படாத கோப்பு வடிவம். PDF, JPG அல்லது PNG ஐப் பயன்படுத்தவும்.',
    hi: 'असमर्थित प्रारूप. कृपया PDF, JPG या PNG का उपयोग करें.',
    te: 'మద్దతు లేని ఫైల్ ఫార్మాట్. దయచేసి PDF, JPG లేదా PNG ఉపయోగించండి.',
    ml: 'പിന്തുണയ്ക്കാത്ത ഫയൽ ഫോർമാറ്റ്. ദയവായി PDF, JPG അല്ലെങ്കിൽ PNG ഉപയോഗിക്കുക.',
    kn: 'ಬೆಂಬಲವಿಲ್ಲದ ಫೈಲ್ ಫಾರ್ಮ್ಯಾಟ್. ದಯವಿಟ್ಟು PDF, JPG ಅಥವಾ PNG ಬಳಸಿ.',
  },
  unreadableDocTitle: {
    en: "Couldn't read document",
    ta: 'ஆவணத்தைப் படிக்க முடியவில்லை',
    hi: 'दस्तावेज़ पढ़ा नहीं जा सका',
    te: 'పత్రాన్ని చదవలేకపోయాము',
    ml: 'പ്രമാണം വായിക്കാനായില്ല',
    kn: 'ದಾಖಲೆಯನ್ನು ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ',
  },
  unreadableDocTips: {
    en: 'Tips: ensure good lighting, flatten the page, or upload a clear PDF.',
    ta: 'குறிப்புகள்: நல்ல வெளிச்சம் இருப்பதை உறுதிசெய்யவும், பக்கத்தை மடிப்பின்றி வைக்கவும் அல்லது தெளிவான PDF ஐப் பதிவேற்றவும்.',
    hi: 'सुझाव: अच्छी रोशनी सुनिश्चित करें, पृष्ठ सीधा रखें या स्पष्ट पीडीएफ अपलोड करें.',
    te: 'చిట్కాలు: మంచి వెలుతురు ఉండేలా చూసుకోండి, పేజీని చదును చేయండి లేదా స్పష్టమైన PDFని అప్‌లోడ్ చేయండి.',
    ml: 'സൂചനകൾ: നല്ല വെളിച്ചം ഉറപ്പാക്കുക, പേജ് നിവർത്തി വെയ്ക്കുക, അല്ലെങ്കിൽ വ്യക്തമായ PDF അപ്‌ലോഡ് ചെയ്യുക.',
    kn: 'ಸಲಹೆಗಳು: ಉತ್ತಮ ಬೆಳಕನ್ನು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ, ಪುಟವನ್ನು ಸಮತಟ್ಟಾಗಿ ಇರಿಸಿ ಅಥವಾ ಸ್ಪಷ್ಟವಾದ PDF ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.',
  },
  tooManyRequests: {
    en: 'Too many requests. Please wait a minute.',
    ta: 'அதிக கோரிக்கைகள். ஒரு நிமிடம் காத்திருக்கவும்.',
    hi: 'बहुत अधिक अनुरोध. कृपया एक मिनट प्रतीक्षा करें.',
    te: 'చాలా ఎక్కువ అభ్యర్థనలు. దయచేసి ఒక నిమిషం వేచి ఉండండి.',
    ml: 'നിരവധി അഭ്യർത്ഥനകൾ. ദയവായി ഒരു മിനിറ്റ് കാത്തിരിക്കുക.',
    kn: 'ತುಂಬಾ ವಿನಂತಿಗಳು. ದಯವಿಟ್ಟು ಒಂದು ನಿಮಿಷ ಕಾಯಿರಿ.',
  },
  actionsDoneCount: {
    en: '{done} of {total} done',
    ta: '{total}-ல் {done} முடிந்தது',
    hi: '{total} में से {done} पूर्ण',
    te: '{total} లో {done} పూర్తయింది',
    ml: '{total}-ൽ {done} കഴിഞ്ഞു',
    kn: '{total} ರಲ್ಲಿ {done} ಪೂರ್ಣಗೊಂಡಿದೆ',
  },
  listenBtnLabel: {
    en: 'Listen',
    ta: 'படித்துக் காட்டு',
    hi: 'सुनें',
    te: 'వినండి',
    ml: 'കേൾക്കുക',
    kn: 'ಕೇಳಿ',
  },
  askBtnLabel: {
    en: 'Ask',
    ta: 'கேள்வி கேளுங்கள்',
    hi: 'पूछें',
    te: 'అడగండి',
    ml: 'ചോദിക്കുക',
    kn: 'ಕೇಳಿ',
  },
  foundInDoc: {
    en: 'Found in your document',
    ta: 'உங்கள் ஆவணத்தில் உள்ளது',
    hi: 'आपके दस्तावेज़ में मिला',
    te: 'మీ పత్రంలో కనుగొనబడింది',
    ml: 'നിങ്ങളുടെ പ്രമാണത്തിൽ കണ്ടെത്തി',
    kn: 'ನಿಮ್ಮ ದಾಖಲೆಯಲ್ಲಿ ಕಂಡುಬಂದಿದೆ',
  },
  checkAgainstOriginal: {
    en: 'Check against original',
    ta: 'அசலுடன் ஒப்பிட்டுப் பார்க்கவும்',
    hi: 'मूल से मिलान करें',
    te: 'అసలుతో సరిచూసుకోండి',
    ml: 'യഥാർത്ഥ പ്രമാണവുമായി ഒത്തുനോക്കുക',
    kn: 'ಮೂಲದೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ',
  },
  calculatedChip: {
    en: 'Calculated',
    ta: 'கணக்கிடப்பட்டது',
    hi: 'गणना की गई',
    te: 'లెక్కించబడింది',
    ml: 'കണക്കാക്കിയത്',
    kn: 'ಲೆಕ್ಕಹಾಕಲಾಗಿದೆ',
  },
}

// Add all new keys to en, ta, hi
for (const [k, obj] of Object.entries(newKeys)) {
  en[k] = obj.en
  ta[k] = obj.ta
  hi[k] = obj.hi
}

// Base translations dictionary map for building te, ml, kn
const te = {}
const ml = {}
const kn = {}

for (const k of Object.keys(en)) {
  if (newKeys[k]) {
    te[k] = newKeys[k].te
    ml[k] = newKeys[k].ml
    kn[k] = newKeys[k].kn
  } else {
    // Inherit or fall back sensibly
    te[k] = en[k]
    ml[k] = en[k]
    kn[k] = en[k]
  }
}

// Specific te, ml, kn mappings for the existing keys
const extraIndic = {
  hello: {
    te: 'ఈ రోజు మీరు దేనిని అర్థం చేసుకోవాలనుకుంటున్నారు?',
    ml: 'ഇന്ന് നിങ്ങൾക്ക് എന്താണ് മനസ്സിലാക്കേണ്ടത്?',
    kn: 'ಇಂದು ನೀವು ಏನನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಬಯಸುತ್ತೀರಿ?',
  },
  takePhoto: { te: 'ఫోటో తీయండి', ml: 'ഫോട്ടോ എടുക്കുക', kn: 'ಫೋಟೋ ತೆಗೆಯಿರಿ' },
  takePhotoSub: {
    te: 'ఒక పేజీ లేదా చాలా పేజీలు. సర్వం కలిసి చదువుతుంది.',
    ml: 'ഒരു പേജ് അല്ലെങ്കിൽ പല പേജുകൾ. സർവം ഒരുമിച്ച് വായിക്കുന്നു.',
    kn: 'ಒಂದು ಪುಟ ಅಥವಾ ಹಲವು. ಸರ್ವಂ ಒಟ್ಟಿಗೆ ಓದುತ್ತದೆ.',
  },
  chooseFile: { te: 'ఫైల్ ఎంచుకోండి', ml: 'ഫയൽ തിരഞ്ഞെടുക്കുക', kn: 'ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ' },
  chooseFileSub: { te: 'PDF లేదా ఫోటోలు', ml: 'PDF അല്ലെങ്കിൽ ഫോട്ടോകൾ', kn: 'PDF ಅಥವಾ ಫೋಟೋಗಳು' },
  samples: { te: 'నమూనా చూడండి', ml: 'സാമ്പിൾ പരീക്ഷിക്കുക', kn: 'ಮಾದರಿಯನ್ನು ಪ್ರಯತ್ನಿಸಿ' },
  privacy: {
    te: 'Google Cloud లో సురక్షితంగా ప్రాసెస్ చేయబడింది. సర్వం ద్వారా నిల్వ చేయబడదు.',
    ml: 'Google Cloud-ൽ സുരക്ഷിതമായി പ്രോസസ്സ് ചെയ്യുന്നു. സർവം സൂക്ഷിക്കുന്നില്ല.',
    kn: 'Google Cloud ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿ ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗಿದೆ. ಸರ್ವಂ ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ.',
  },
  summaryTitle: { te: 'సరళమైన మాటలలో', ml: 'ലളിതമായ വാക്കുകളിൽ', kn: 'ಸರಳ ಮಾತುಗಳಲ್ಲಿ' },
  actionsTitle: { te: 'మీరు ఏమి చేయాలి', ml: 'നിങ്ങൾ ചെയ്യേണ്ട കാര്യങ്ങൾ', kn: 'ನೀವು ಮಾಡಬೇಕಾದದ್ದು' },
  riskTitle: { te: 'జాగ్రత్త', ml: 'ശ്രദ്ധിക്കുക', kn: 'ಎಚ್ಚರ ವಹಿಸಿ' },
  factsTitle: { te: 'ముఖ్య విషయాలు', ml: 'പ്രധാന വിവരങ്ങൾ', kn: 'ಮುಖ್ಯ ವಿವರಗಳು' },
  listen: { te: 'వినండి', ml: 'കേൾക്കുക', kn: 'ಕೇಳಿ' },
  share: { te: 'షేర్ చేయండి', ml: 'പങ്കിടുക', kn: 'ಹಂಚಿಕೊಳ್ಳಿ' },
  done: { te: 'పూర్తయింది', ml: 'പൂർത്തിയായി', kn: 'ಆಗಿದೆ' },
  datePassed: { te: 'తేదీ ముగిసింది', ml: 'തീയതി കഴിഞ്ഞു', kn: 'ದಿನಾಂಕ ಮುಗಿದಿದೆ' },
  calculated: { te: 'లెక్కించబడింది', ml: 'കണക്കാക്കിയത്', kn: 'ಲೆಕ್ಕಹಾಕಲಾಗಿದೆ' },
  fromDoc: { te: 'మీ పత్రంలో ఉంది', ml: 'നിങ്ങളുടെ പ്രമാണത്തിൽ കണ്ടെത്തി', kn: 'ನಿಮ್ಮ ದಾಖಲೆಯಲ್ಲಿ ಕಂಡುಬಂದಿದೆ' },
  originalText: { te: 'మీ పత్రం నుండి అసలు పాఠం', ml: 'നിങ്ങളുടെ പ്രമാണത്തിൽ നിന്നുള്ള യഥാർത്ഥ വാചകം', kn: 'ನಿಮ್ಮ ದಾಖಲೆಯಿಂದ ಮೂಲ ಪಠ್ಯ' },
  comparePaper: { te: 'దయచేసి మీ పేపర్‌తో సరిచూసుకోండి', ml: 'ദയവായി നിങ്ങളുടെ പേപ്പറുമായി ഒത്തുനോക്കുക', kn: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಕಾಗದದೊಂದಿಗೆ ಹೋಲಿಸಿ' },
  disclaimer: {
    te: 'సర్వం మీ పత్రాన్ని వివరిస్తుంది. ఇది డాక్టర్ లేదా ప్రభుత్వ కార్యాలయాన్ని భర్తీ చేయదు.',
    ml: 'സർവം നിങ്ങളുടെ രേഖ വിശദീകരിക്കുന്നു. ഇത് ഡോക്ടർക്കോ സർക്കാർ ഓഫീസിനോ പകരമാവില്ല.',
    kn: 'ಸರ್ವಂ ನಿಮ್ಮ ದಾಖಲೆಯನ್ನು ವಿವರಿಸುತ್ತದೆ. ಇದು ವೈದ್ಯರು ಅಥವಾ ಸರ್ಕಾರಿ ಕಚೇರಿಗೆ ಪರ್ಯಾಯವಲ್ಲ.',
  },
  stepWriting: { te: '{lang} లో రాస్తున్నాము', ml: '{lang}-ൽ എഴുതുന്നു', kn: '{lang} ನಲ್ಲಿ ಬರೆಯಲಾಗುತ್ತಿದೆ' },
  recent: { te: 'ఈ ఫోన్‌లో ఇటీవలివి', ml: 'ഈ ഫോണിലെ സമീപകാല ഫലങ്ങൾ', kn: 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಇತ್ತೀಚಿನವು' },
  recentFooter: {
    te: 'ఈ ఫోన్‌లో మాత్రమే సేవ్ చేయబడింది. సర్వం ద్వారా నిల్వ చేయబడదు.',
    ml: 'ഈ ഫോണിൽ മാത്രം സംരക്ഷിച്ചു. സർവം സൂക്ഷിക്കുന്നില്ല.',
    kn: 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಮಾತ್ರ ಉಳಿಸಲಾಗಿದೆ. ಸರ್ವಂ ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ.',
  },
  saveRecentSetting: { te: 'ఈ ఫోన్‌లో ఫలితాలను సేవ్ చేయండి', ml: 'ഈ ഫോണിൽ ഫലങ്ങൾ സംരക്ഷിക്കുക', kn: 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಫಲಿತಾಂಶಗಳನ್ನು ಉಳಿಸಿ' },
  deleteAll: { te: 'అన్నీ తొలగించండి', ml: 'എല്ലാം ഇല്ലാതാക്കുക', kn: 'ಎಲ್ಲವನ್ನೂ ಅಳಿಸಿ' },
  delete: { te: 'తొలగించు', ml: 'ഇല്ലാതാക്കുക', kn: 'ಅಳಿಸಿ' },
  keep: { te: 'ఉంచండి', ml: 'സൂക്ഷിക്കുക', kn: 'ಇರಿಸಿಕೊಳ್ಳಿ' },
}

for (const [k, obj] of Object.entries(extraIndic)) {
  if (te[k] !== undefined) te[k] = obj.te
  if (ml[k] !== undefined) ml[k] = obj.ml
  if (kn[k] !== undefined) kn[k] = obj.kn
}

// Write back updated files
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n', 'utf8')
fs.writeFileSync(taPath, JSON.stringify(ta, null, 2) + '\n', 'utf8')
fs.writeFileSync(hiPath, JSON.stringify(hi, null, 2) + '\n', 'utf8')

const tePath = path.join(__dirname, '../src/i18n/te.json')
const mlPath = path.join(__dirname, '../src/i18n/ml.json')
const knPath = path.join(__dirname, '../src/i18n/kn.json')

fs.writeFileSync(tePath, JSON.stringify(te, null, 2) + '\n', 'utf8')
fs.writeFileSync(mlPath, JSON.stringify(ml, null, 2) + '\n', 'utf8')
fs.writeFileSync(knPath, JSON.stringify(kn, null, 2) + '\n', 'utf8')

console.log('en keys:', Object.keys(en).length)
console.log('ta keys:', Object.keys(ta).length)
console.log('hi keys:', Object.keys(hi).length)
console.log('te keys:', Object.keys(te).length)
console.log('ml keys:', Object.keys(ml).length)
console.log('kn keys:', Object.keys(kn).length)

// Generate review sheet OUTSIDE repo (WEB-13)
// "Produce a review sheet OUTSIDE the repo (scratch folder, CSV with key, English, translation) for the 60 most visible strings so native speakers can check them. Tell me the path."
const scratchDir = '/Users/vigneshwaran/.gemini/antigravity/brain/8dd006c1-28d0-4f16-9edc-8a5308980953/scratch'
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true })
}
const csvPath = path.join(scratchDir, 'review-strings.csv')

// Take top 60 most visible keys
const visibleKeys = [
  'hello', 'takePhoto', 'chooseFile', 'summaryTitle', 'actionsTitle', 'riskTitle', 'factsTitle',
  'listen', 'share', 'done', 'datePassed', 'calculated', 'matched', 'checkOriginal', 'disclaimer',
  'readingTitle', 'stepReading', 'stepChecking', 'stepWriting', 'reassuranceText',
  'atAGlance', 'showAll', 'showLess', 'places', 'contacts', 'openInMaps', 'directions',
  'addToCalendar', 'addAllDates', 'medicineReminders', 'addReminders', 'quickSummary', 'fullDetails',
  'voiceFemale', 'voiceMale', 'speed', 'makeEasierToRead', 'textSize', 'lineSpacing',
  'easyReadMode', 'highContrast', 'reduceMotion', 'largerTapTargets', 'passwordRequiredTitle',
  'unlock', 'skip', 'askPlaceholder', 'askChip1', 'askChip2', 'askChip3', 'askNotFound',
  'trySample', 'samplePension', 'sampleInsurance', 'sampleLab', 'nextUp', 'offlineNotice',
  'listenBtnLabel', 'askBtnLabel', 'recent', 'recentFooter'
]

const csvRows = ['"Key","English","Tamil","Hindi","Telugu","Malayalam","Kannada"']
for (const k of visibleKeys) {
  const escapeCsv = (str) => `"${(str || '').replace(/"/g, '""')}"`
  csvRows.push([
    escapeCsv(k),
    escapeCsv(en[k]),
    escapeCsv(ta[k]),
    escapeCsv(hi[k]),
    escapeCsv(te[k]),
    escapeCsv(ml[k]),
    escapeCsv(kn[k])
  ].join(','))
}

fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8')
console.log('CSV review sheet generated at:', csvPath)
