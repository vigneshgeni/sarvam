# UI reference screens

These are the approved designs from the Sarvam design canvas. Each one is a 390×844 phone screen in a template format: inline styles, `{{ holes }}` for values, `<sc-if>`/`<sc-for>` for conditions and lists, and a `Component` script at the bottom that shows every state and its copy.

Use them as visual and behavioural references only. Re-create them in React + Tailwind. Don't import or render these files.

| File | Screen |
| --- | --- |
| VoiceHome.dc.html | 1 Home: Ask bar, reminders, Live Relay, Choose files, samples, Recent, Private by design |
| LiveScanner.dc.html | 2 Live Relay camera: shutter, page stack, Proceed |
| LiveCaptured.dc.html | 3 Scanned pages + Gemini Live (solo) |
| RelayRoom.dc.html | 4 Video call (host): tiles, private card, reminder, captions, camera handoff, invite sheet |
| RelayGuest.dc.html | 5 Guest phone: join, call, show my camera, left |
| LiveSaved.dc.html | 6 Session saved |
| VoiceNotifications.dc.html | 7 Notifications |
| GoogleConnect.dc.html | 8 Connect Google + plan |
| FormFill.dc.html | 9 Fill a form → PDF → share |
| Ask.dc.html | 10 Ask Sarvam (existing design, agentic cards, model picker) |
