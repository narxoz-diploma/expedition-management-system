import type { Dictionary } from "./ru";

/** Английский. Структура — ровно как у русского, см. ru.ts. */
export const en: Dictionary = {
  meta: {
    title: "Step Up — Narxoz University mountain club",
    titleTemplate: "%s · Step Up",
    description:
      "Student mountain club of Narxoz University. Hikes in the Trans-Ili Alatau — from a first walk to serious routes.",
    ogLocale: "en_US",
  },

  header: {
    signIn: "Sign in",
    language: "Language",
  },

  menu: {
    open: "Menu, {name}",
    dialogLabel: "Account menu",
    profile: "profile",
    admin: "Manage",
    groups: {
      hikes: "Hikes",
      mine: "Mine",
      club: "About the club",
      theme: "Theme",
    },
    links: {
      allHikes: "All hikes",
      team: "Team",
      gear: "Gear",
      rules: "Rules & safety",
      gearGuide: "What to bring",
    },
    signOut: "Sign out",
    theme: {
      system: "Auto",
      systemFull: "Match system",
      light: "Light",
      dark: "Dark",
    },
    status: {
      admin: "Admin",
      leader: "Leader",
      member: "Member",
      pending: "Applied",
      alumni: "Alumni",
      guest: "Guest",
    },
  },

  footer: {
    navLabel: "Footer",
    rules: "Rules & safety",
    gearGuide: "What to bring",
    team: "Team",
    club: "Step Up · Narxoz University",
  },

  categories: {
    1: "walk",
    2: "easy route",
    3: "needs fitness",
    4: "hard route",
    5: "serious route",
  },

  categoryScale: {
    title: "Category {n} of 5 — {label}",
  },

  hikeCard: {
    km: "{n} km",
    gain: "{n} m gain",
    hours: "{n} h",
    start: "Starts at {time}",
    startPast: "Started at {time}",
    cancelled: "Cancelled",
    newcomers: "Open to newcomers",
  },

  spots: {
    capacity: { one: "{n} spot", few: "{n} spots", many: "{n} spots", other: "{n} spots" },
    full: "No spots left — you can join the waitlist",
    fullQueue: ", {people} waiting",
    people: { one: "{n} person", few: "{n} people", many: "{n} people", other: "{n} people" },
    left: "{left} of {capacity} left",
    went: "{people} went",
    leadOne: "Led by {leaders}",
    leadMany: "Led by {leaders}",
    leaders: { one: "{n} leader", few: "{n} leaders", many: "{n} leaders", other: "{n} leaders" },
    onTrail: "{people} on the trail",
    ofThem: ", including {leaders}",
  },

  strikes: {
    hikes: { one: "{n} hike", few: "{n} hikes", many: "{n} hikes", other: "{n} hikes" },
    count: { one: "{n} strike", few: "{n} strikes", many: "{n} strikes", other: "{n} strikes" },
    late: "Late cancellation",
    noShow: "No-show",
    title: "Strikes",
    lead: "For late cancellations and no-shows. They expire on their own after a few club hikes.",
    rulesLink: "How it works",
    row: "{kind} — {hike}, {date}. Expires in {hikes}",
    restrictedTitle: "For now you can only join the waitlist",
    restrictedBody:
      "For {hikes} more. If a spot opens up on a hike, the leader can take you from the waitlist.",
    registerNote:
      "You have strikes for a late cancellation or a no-show — for now you can only join the waitlist, for {hikes} more. If a spot opens up, the leader can take you.",
    waitlistNote:
      "Because of your strikes the waitlist won't move you up on its own — the leader can take you if a spot opens up. This lifts in {hikes}.",
  },

  myStatus: {
    confirmed: "You have a spot",
    waitlist: "Waitlist",
    waitlistPos: "Waitlist, #{n}",
  },

  profileFields: {
    signIn: "sign-in",
    fullName: "full name",
    phone: "phone",
    birthDate: "date of birth",
    fitness: "fitness level",
    emergencyContact: "emergency contact",
    consent: "consent to data processing",
  },

  home: {
    greeting: "Hi, {name}",
    incompleteTitle: "Your profile isn't complete",
    incompleteBody: "To sign up for hikes, add your {fields}.",
    completeCta: "Complete profile",
    youGo: "You're going",
    upcoming: "Upcoming hikes",
    emptyNone: "Nothing is planned yet. New hikes appear as they're planned.",
    emptyAllMine: "You're signed up for all upcoming hikes.",
    pastLink: "Where the club has been",
    checkGear: "Check your gear",
  },

  newcomer: {
    title: "Your first hike with the club",
    lead: "Three steps — and you're a Step Up member.",
    done: " — done",
    profile: "Fill in your profile",
    profileDone: "Done — the leader knows how to reach you.",
    profileLeft: "Still needed: {fields}.",
    profileCta: "Fill in profile",
    hike: "Sign up for a newcomer hike",
    hikeMine: "Signed up:",
    hikeGear: "Pack your gear from the list",
    hikeSee: "View hike",
    hikeNone:
      "There are no hikes open to newcomers right now — they'll appear here as soon as a leader publishes one.",
    go: "Complete the hike",
    goHint:
      "The leader marks the route as completed — and you become a club member: all hikes for your level open up.",
  },

  hikesCta: {
    label: "Browse hikes",
  },

  hikesList: {
    metaTitle: "Hikes",
    metaDescription:
      "Upcoming Step Up hikes in the Trans-Ili Alatau mountains and an archive of past ones.",
    title: "Hikes",
    tabsLabel: "Which hikes to show",
    upcoming: "Upcoming",
    past: "Past",
    emptyUpcoming:
      "No upcoming hikes yet. As soon as a leader publishes one, it will appear here.",
    emptyPast: "No past hikes yet.",
    toPast: "Where the club has been",
    toUpcoming: "Upcoming hikes",
  },

  hike: {
    metaNotFound: "Hike not found",
    metaDescription: "Category {n} of 5. Starts {datetime}.",
    back: "All hikes",
    cancelled: "This hike is cancelled.",
    draft: "This is a draft. Only leaders can see it — it isn't shown to participants yet.",
    dateLine: "{date}, starts at {time}",
    distance: "Distance",
    gain: "Elevation gain",
    duration: "Duration",
    km: "{n} km",
    meters: "{n} m",
    hoursAbout: "about {n} h",
    meeting: "Meeting",
    meetingPast: "Met",
    onMap: "on the map",
    meetingHidden: "The meeting point is visible to people signed up for the hike.",
    cost: "Costs",
    costAbout: "about {cost}",
    costCash: "Paid in cash on the spot — the site doesn't take payments.",
    leadOne: "Leader",
    leadMany: "Leaders",
    ledOne: "Led by",
    ledMany: "Led by",
    photos: "Photos",
    route: "About the route",
    closed: {
      cancelled: "This hike is cancelled.",
      completed: "This hike has already taken place.",
      draft: "This hike isn't published yet.",
      started: "This hike has already started.",
      notOpen: "You can't sign up yet — spots are given out in order once registration opens.",
      closed: "Registration is closed.",
    },
    factRegistration: "Registration",
    factWho: "Who can go",
    whoNewcomers: "Open to newcomers — even if it's your first hike with the club",
    whoMembers: "Club members only",
    factWaiver: "Waiver",
    factCancel: "Cancelling",
    cancelFreeUntil: "No consequences until {cutoff}",
    cancelLateNow: "Sign-up is closed — cancelling now counts as late",
    waiverAfter: "A signed one is required — the form opens after you sign up",
    windowOpens: "Opens {opens}",
    windowCloses: "Closes {closes}",
    windowClosesAtStart: "Closes right before the start",
    windowClosed: "Closed",
    windowOpenUntil: "Open until {closes}",
    windowOpenToStart: "Open until the start",
    waiverTitle: "Waiver required",
    waiverBody:
      "Print the form, sign it and bring it to the start. We don't set off without a signed waiver.",
    waiverByAge:
      "The form depends on your age. Add your date of birth to your profile and only yours will stay here.",
    waiverWaitlist: "You can download it once you get a spot from the waitlist.",
    waiverMissing: "The form hasn't been uploaded yet — message the leader.",
    waiverDownload: "Download waiver",
    waiverAdult: "for adults",
    waiverMinor: "for under-18s — signed by a parent",
  },

  register: {
    heading: "Sign-up",
    leaderTitle: "You're leading this hike",
    leaderNote:
      "You don't take a participant spot. If you can't go, remove yourself from the leaders on the hike edit screen.",
    bannedTitle: "Sign-ups are closed for you right now",
    bannedNote:
      "This happens after a conversation with the club leaders. If it's unclear why, message a leader — people sort this out, not the site.",
    membersOnlyTitle: "This hike is for club members",
    membersOnlyNote:
      "You become a member after your first hike with the club. Your first one should be marked “Open to newcomers”.",
    nearestNewcomer: "Next newcomer hike:",
    seeNewcomer: "View the newcomer hike",
    noNewcomer:
      "There are no hikes open to newcomers right now — they'll appear in the feed as soon as a leader publishes one.",
    joinWithCode: "Been in the club for a while? Confirm with a code",
    signIn: "Sign in to sign up",
    signInQueue: "Sign in to join the waitlist",
    signInNoteOpen: "Sign in with Google or with a link to your email. No password needed.",
    signInNoteMembers:
      "This hike is for club members — after signing in you'll see whether you can go. No password needed.",
    confirmed: "You have a spot",
    waitlist: "Waitlist",
    waitlistPos: "Waitlist, #{n}",
    confirmedNote: "If your plans change, cancel before {cutoff} — the spot will go to the next person.",
    confirmedNoteLate:
      "Sign-up is closed. If you can't make it, still cancel — the leader will have time to invite someone else.",
    waitlistNoteFrozen:
      "Sign-up is closed and the waitlist no longer moves on its own. If a spot opens up, the leader will message you on WhatsApp.",
    waitlistNote:
      "If someone drops out, you'll move up automatically. The leader will post in the group.",
    lateCancel: "Sign-up is already closed — this cancellation will count as late.",
    cancelling: "Cancelling…",
    confirmCancel: "Yes, cancel my sign-up",
    keep: "Keep it",
    cancel: "Cancel sign-up",
    profileCta: "Complete profile and sign up",
    profileCtaQueue: "Complete profile and join the waitlist",
    profileNote: "Still needed: {fields}. Just once — after that signing up takes two taps.",
    registering: "Signing up…",
    submit: "Sign up",
    submitQueue: "Join the waitlist",
    fillProfile: "Complete profile",
    registerNoteFree: "{spots} free — the spot is yours right away. No moderation.",
    registerNoteQueue:
      "No spots left. You'll be #{n} on the waitlist — if someone drops out, you'll move up automatically.",
    jump: "To sign-up",
  },

  routeSteps: {
    label: "Route stops",
    start: "start",
    finish: "finish",
  },

  weather: {
    title: "Weather on the day, {altitude}",
    window: "Forecast for {date}, {from} to {to}",
    temp: "Temperature",
    feels: "Feels like",
    windUpTo: "Wind up to",
    ms: "m/s",
    snow: "Snow",
    cm: "cm",
    precip: "Precipitation",
    mm: "mm",
    meters: "m",
    noPrecip: "none expected",
    cityNote:
      "It will be warmer in the city at that time. Dress for this forecast, not for what you see out the window.",
    uncertain: " The hike is still a few days away — the numbers will change, check again closer to the date.",
    wind: { light: "light", moderate: "moderate", strong: "strong", veryStrong: "very strong" },
    rain: { light: "light rain", moderate: "moderate rain", heavy: "heavy rain" },
    snowLevel: { dusting: "a light dusting", noticeable: "noticeable snowfall", heavy: "heavy snowfall" },
  },

  hikeNotFound: {
    title: "There's no such hike",
    body: "This link leads nowhere. Usually it means the hike was removed from the site or the link is old — hikes live in chats longer than on the site.",
    upcoming: "Upcoming hikes",
    past: "Where the club has been",
    ask: "If the hike definitely happened and a leader gave you the link, ask in the club's feed:",
  },

  login: {
    metaTitle: "Sign in",
    errors: {
      provider: "Google sign-in didn't finish. Try again or sign in with an email link.",
      no_code: "The sign-in link is incomplete. Open the whole link or request a new one.",
      exchange: "The sign-in link has already been used or has expired. Request a new one.",
    },
    googleFailed: "Couldn't open Google sign-in. Sign in with an email link instead.",
    rateLimited: "Too many requests in a row. Wait a minute and try again.",
    sendFailed: "Couldn't send the email. Check the address and try again.",
    sentTitle: "Email sent",
    sentBefore: "We sent a sign-in link to",
    sentAfter: "Open it on this same device — the link works once and lasts about an hour.",
    spam: "No email after a minute? Check your spam folder.",
    otherEmail: "Use a different address",
    title: "Sign in",
    lead: "No password needed — sign in with Google.",
    inAppTitle: "Open this page in your browser",
    inAppBody:
      "This page is open in a messenger's built-in window, and Google doesn't allow sign-in there. Tap “···” at the top and choose “Open in browser” — or sign in with an email link, which works here too.",
    copied: "Link copied",
    copy: "Copy link",
    google: "Sign in with Google",
    supabaseBefore: "The Google window will briefly show the address",
    supabaseAfter: "— that's the service that runs sign-in for the club site. This is expected.",
    emailToggle: "Having trouble? Sign in with an email link",
    emailLabel: "Email",
    sending: "Sending…",
    send: "Email me a sign-in link",
  },

  notFound: {
    title: "This page doesn't exist",
    body: "The link may be outdated, or there may be a typo in the address. Everything on the site starts from these two pages.",
    upcoming: "Upcoming hikes",
    home: "Home",
  },

  fitnessLevels: {
    1: "I tire quickly, haven't done long walks in a while",
    2: "I'd manage 10 km over hills — tired, but I'd make it",
    3: "I walk or run regularly, 15–20 km is no problem",
  },

  profile: {
    metaTitle: "Profile",
    membership: {
      guest: "Guest",
      pending: "Application under review",
      member: "Club member",
      alumni: "Alumni",
    },
    guestNote: " — you become a member after your first completed hike",
    data: "Details",
    edit: "Edit",
    phone: "Phone",
    studyYear: "Year of study",
    fitness: "Fitness",
    visited: "Where you've been",
    visitedEmpty: "Not filled in — it helps the leader understand who they're hiking with",
    emergency: "Emergency contact",
    privacy:
      "Your phone and emergency contact are visible only to the leader of a hike you've signed up for. They aren't in your public profile.",
    gear: "Gear",
    gearEmpty: "Mark what you have — the leader will see in advance what's missing",
    gearReady: "Equipped up to category {n}",
    teamCard: "Team card",
    teamCardNote: "Visible to everyone on the Team page and on your hikes. The club sets your role and order.",
    upcoming: "Upcoming hikes",
    noRegistrations: "No sign-ups yet.",
    browseHikes: "Browse hikes",
    hikeCancelled: "Hike cancelled",
    past: "Completed hikes",
    pendingNote: "Your membership application has been sent.",
    guestCodeNote:
      "Been in the club for a while, but the site thinks you're a guest? Confirm your membership with a code.",
    pendingCta: "About the application",
    guestCodeCta: "I have a club code",
    retention:
      "Your data is kept while you hike with the club and deleted a year after your last hike. You can also delete it earlier, at any time.",
  },

  profileEdit: {
    backHike: "Back to hike",
    backProfile: "Profile",
    titleMissing: "Almost there",
    title: "Your profile",
    fromHike: "To sign up, fill in your {fields}. Just once — after that signing up takes two taps.",
    lead: "The leader needs these details to build the group and reach you.",
  },

  profileForm: {
    fullName: "Full name",
    fullNameHint: "As in your documents — the leader finds you in the group list by it.",
    phone: "Phone",
    phoneHint:
      "The one you use on WhatsApp — the leader builds the group through it. Foreign numbers — with the country code.",
    birthDate: "Date of birth",
    studyYear: "Year of study",
    studyYearNone: "Not specified",
    studyYearOption: "Year {n}",
    fitness: "Fitness",
    fitnessNote:
      "Be honest. This isn't a gate: it doesn't let you in or shut you out — the leader just needs to know who they're leading. Mountain experience and fitness are different things.",
    visited: "Where you've been",
    visitedHint:
      "About mountains before the club: where you went, with whom, when. Only your hike's leader sees it. Never been anywhere — just say so, that's normal and changes nothing.",
    visitedPlaceholder: "Furmanov Peak with school, Kok Zhailau last summer",
    emergency: "If something happens",
    emergencyNote:
      "Who to call from the route. Only your hike's leader sees it, nobody else. If you're under 18, this must be a parent.",
    emergencyName: "Who is it",
    emergencyNamePlaceholder: "Mum, Aigul",
    emergencyPhone: "Their phone",
    emergencyIsParent: "This is my parent or guardian",
    consent:
      "I consent to the club storing my name, phone, date of birth and emergency contact — to build the group and reach someone if something happens on the route. The data isn't published or shared with anyone outside the club. It's kept while I hike with the club and deleted a year after my last hike. I can delete it earlier at any time with the button in my profile.",
    saving: "Saving…",
    save: "Save",
  },

  profileActions: {
    sessionExpired: "Your session has expired. Sign in again.",
    checkFields: "Check the highlighted fields",
    phoneTaken: "This number is already linked to another profile. Message a leader.",
    saveFailed: "Couldn't save. Please try again.",
    contactFailed: "Your profile was saved, but the contact wasn't. Please try again.",
    avatarForeign: "Not your file",
    avatarSaveFailed: "The photo uploaded but wasn't saved. Please try again",
    teamLeadersOnly: "Only leaders have a team card.",
    teamTooLong: "Too long — up to {max} characters, now {n}.",
    teamBadInstagram: "That doesn't look like an Instagram handle: Latin letters, digits, dots and underscores.",
    teamSaved: "Saved — visible on the Team page.",
    needSignIn: "You need to sign in",
    leadsFutureDelete:
      "You're leading an upcoming hike. Hand it over to another leader — then you can delete your data.",
  },

  avatar: {
    failed: "Couldn't upload the photo. Please try again",
    uploading: "Uploading…",
    change: "Change photo",
    add: "Add photo",
  },

  deleteAccount: {
    leadsFuture:
      "You're leading an upcoming hike, so your data can't be deleted yet. Hand it over to another leader on the hike edit screen and the button will appear.",
    start: "Delete my data",
    confirmTitle: "Delete everything with no way back?",
    confirmBody:
      "Your profile, phone, emergency contact, gear checklist and all your hike sign-ups will be gone. Sign-ups for upcoming hikes will be cancelled and the spots will go to people in the queue. This can't be restored — but you can sign in with Google again at any time, with an empty profile.",
    failed: "That didn't work",
    deleting: "Deleting…",
    confirm: "Yes, delete",
    keep: "Don't delete",
  },

  teamCard: {
    bio: "About you",
    bioPlaceholder: "How long you've been in the mountains, favourite routes, why you lead groups",
    bioHint: "A couple of sentences for newcomers and parents — up to 300 characters.",
    instagram: "Instagram",
    instagramHint: "With @ or a full link is fine. Empty — not shown.",
    saving: "Saving…",
    save: "Save card",
    seeTeam: "View the team",
  },

  gear: {
    metaTitle: "Gear",
    title: "Gear",
    lead: "Mark what you have. Only your hike's leader sees the list — so they know in advance who'd come without something essential, and don't have to turn the group around over one pair of trainers.",
    notReadyBasic: "The basics for category 1 are missing",
    readyUpTo: "You're equipped up to category {n}",
    missingFor: "For category {n} you're missing:",
    promised: "You promised to get:",
    promisedAfter: ". Mark “Have” once it's in your hands — until then it doesn't count toward readiness.",
    allReady: "Ready for any club route.",
    empty: "The gear list is empty for now.",
    guideNote: "What each item is for and from which category it becomes required — on a separate page.",
    guideLink: "What to bring",
  },

  gearForm: {
    own: "Have",
    willGet: "Will get",
    none: "Don't have",
    intro:
      "Marks save instantly. “Will get” — if you don't have it but know where to get it before the hike: buy it, borrow it from friends. The club doesn't lend or store gear, so it doesn't count toward readiness until you mark “Have”.",
    fromCategory: "from category {n}",
    saving: "Saving…",
  },

  gearGroups: {
    shoes: "Footwear",
    clothing: "Clothing",
    gear: "Hiking gear",
    safety: "Safety",
    other: "Other",
  },

  gearItems: {
    boots: "Shoes with a grippy sole",
    backpack: "Backpack, 20 L or more",
    rain: "Rain jacket or shell",
    water: "1.5 L of water and a snack",
    sunhat: "Hat and sunscreen",
    warm: "Warm layer",
    gloves: "Beanie and gloves",
    poles: "Trekking poles",
    headlamp: "Headlamp",
    sunglasses: "Sunglasses",
    firstaid: "Personal first-aid kit",
    thermos: "Thermos",
    powerbank: "Power bank",
    spikes: "Microspikes",
    sleeping: "Sleeping bag",
  },

  gearActions: {
    sessionExpired: "Your session has expired. Sign in again.",
    noItem: "No such item.",
    badMark: "Unknown mark.",
    saveFailed: "Didn't save — tap again.",
  },

  join: {
    metaTitle: "Confirm membership",
    memberTitle: "You're already a club member",
    memberBody: "You can sign up for any hike at your level.",
    browseHikes: "Browse hikes",
    alumniTitle: "You have alumni status",
    alumniBody:
      "Your history and stats stay with you. To go on a hike, message a leader — they'll sign you up manually, and it doesn't take a spot.",
    title: "Confirm membership",
    lead: "For people who've been in the club a while: enter the semester code and all hikes for your level open right away.",
  },

  joinForm: {
    codeLabel: "Semester code",
    codeHint: "A leader posts it in the club group once a semester.",
    checking: "Checking…",
    submit: "Confirm with code",
    noCode: "no code",
    appliedTitle: "Application sent",
    appliedBody:
      "A leader will see and confirm it. While you wait, you can go on any hike marked “Open to newcomers” — it gives you membership too.",
    applyNote:
      "No code, but you've been in the club a while — say, your number changed? You can ask a leader to confirm you manually. If this is your first season with the club, you don't need to apply: your first completed hike marked “Open to newcomers” makes you a member.",
    sending: "Sending…",
    apply: "Ask for manual confirmation",
  },

  membershipActions: {
    enterCode: "Enter the code.",
    joined: "Done — you're a club member.",
    invalidCode: "There's no such code. Check your keyboard layout.",
    expiredCode: "The code has expired. Ask a leader for a new one.",
    exhaustedCode: "The code has been used up. Ask a leader for a new one.",
    alreadyApplied: "You've already applied, or you're already a member.",
    applied: "Application sent. A leader will see it.",
  },

  landing: {
    hero: {
      eyebrow: "Narxoz University",
      title: "Head to the mountains this weekend",
      lead: "Step Up is a student mountain club. We hike in the Trans-Ili Alatau every weekend — from half-day walks to serious routes. You don't need gear or experience to start.",
      ctaHikes: "Upcoming hikes",
      ctaGear: "What to bring",
    },
    gallery: {
      title: "What it looks like",
      label: "Photos from hikes",
      pastLink: "Where the club has been",
      more: "More on the club's feed:",
    },
    numbers: {
      hikes: { one: "hike", few: "hikes", many: "hikes", other: "hikes" },
      members: { one: "member", few: "members", many: "members", other: "members" },
      elevation: "total elevation gain",
      meters: "m",
      routes: { one: "route", few: "routes", many: "routes", other: "routes" },
    },
    forWhom: {
      title: "Who it's for",
      lead: "Four reasons people usually hold back. Straight answers.",
      items: [
        {
          q: "I've never been to the mountains",
          a: "That's fine — almost everyone started there. On hikes marked “open to newcomers” the leader walks at the pace of the slowest person, not the fastest.",
        },
        {
          q: "I don't have any gear",
          a: "For your first hikes, trainers with a grippy sole, a backpack and a rain jacket are enough. Everything else comes when you actually need it.",
        },
        {
          q: "I'm not in shape",
          a: "Category 1 is a half-day walk on a trail. If you're unsure, message the leader before signing up — they'll tell you honestly whether a particular route is for you.",
        },
        {
          q: "I don't know anyone in the club",
          a: "20–25 people come on a hike, and half of them came alone too. By the end of the route it stops being a problem.",
        },
      ],
    },
    categories: {
      title: "Five categories",
      lead: "Your first hike can be any hike marked “Open to newcomers” — leaders open those to people hiking with the club for the first time. After that, the category is chosen by experience, not by wish — it's safer for everyone walking next to you.",
      item: "Category {n}.",
      descriptions: {
        1: "A half-day walk on a well-trodden trail. No training or special gear needed.",
        2: "A day in the mountains with noticeable elevation gain. You need shoes with a good tread and a warm layer.",
        3: "A long day, steep sections, and the weather up top may be different. Poles and a headlamp.",
        4: "Serious climbs, tricky terrain and snowy sections that can make the route much harder. Requires experience on category 3 hikes.",
        5: "A serious route with a possible overnight stay and major elevation gain. Requires experience, good fitness and full gear.",
      },
    },
    safety: {
      title: "Safety",
      lead: "The mountains near Almaty look easy, and that's exactly why things go wrong here. This is what the club does to prevent it.",
      points: [
        "Every hike is led by a leader who has done the route before.",
        "The leader has the group list and emergency contacts.",
        "The group walks at the pace of the slowest participant.",
        "A hike is cancelled if the weather turns. That happens, and it's not up for debate.",
        "You can leave the route at any point, and it doesn't count as a failure.",
      ],
      rulesLink: "Full club rules",
    },
    team: {
      title: "Team",
      all: "Whole team — {n}",
      more: "More about the team",
    },
    upcoming: {
      title: "Upcoming hikes",
      empty:
        "Nothing is planned right now. Check back in a few days — new hikes appear as they're planned.",
      allLink: "All hikes",
    },
    join: {
      title: "How to join the club",
      lead: "There's no selection: pick a hike marked “open to newcomers” and go. You become a club member after your first completed route.",
      cta: "Choose a hike",
      faq: [
        {
          q: "How much does it cost",
          a: "Membership is free. For a hike people chip in for transport and the park entrance — usually a couple of thousand tenge, in cash on the spot. The site doesn't take payments.",
        },
        {
          q: "How do I sign up",
          a: "Sign in with Google, fill in six profile fields and tap “Sign up” on the hike you want. You get an answer right away: a spot or a place in the queue.",
        },
        {
          q: "What if there are no spots left",
          a: "You'll join the waitlist. People drop out often and the queue moves: while sign-up is open, a freed spot goes to the next person automatically. After sign-up closes, the leader hands out spots — they'll message you if one opens up.",
        },
        {
          q: "What if I signed up and changed my mind",
          a: "Cancel on the hike page before sign-up closes — then there are no consequences, and the spot goes to the next person in the queue. Later it counts as a late cancellation, but still cancel: it's better than not showing up.",
        },
      ],
    },
  },

  rules: {
    metaTitle: "Rules and safety",
    metaDescription:
      "What the Step Up club expects from participants, what the leader does, what to do if you fall behind the group and when a hike is cancelled.",
    title: "Rules and safety",
    lead: "A short document worth reading before your first hike. It also answers parents' questions.",
    leader: {
      title: "What the leader does",
      items: [
        "Walks the route in advance or knows it from previous hikes.",
        "Carries the group list and the contacts of people's relatives for emergencies.",
        "Leads the group at the pace of the slowest participant.",
        "Decides to turn the group back if the weather or people's condition calls for it. This decision isn't debated on the trail.",
        "Appoints a sweep: someone who walks last, so no one is left behind unnoticed.",
      ],
    },
    participant: {
      title: "What's expected of participants",
      items: [
        "Arrive on time. The group doesn't wait for latecomers longer than fifteen minutes — otherwise the whole schedule shifts, and descending in the dark is more dangerous.",
        "Bring the gear on the list for the hike's category. The leader may not let you on the hike with unsuitable gear.",
        "Bring a signed waiver to the meeting point. The form is on the hike page — print and sign it in advance. Without a waiver you can't set off: the leader has no choice here.",
        "Don't walk ahead of the leader or fall behind the sweep.",
        "Tell the leader if you feel unwell, get a blister or it's simply hard. The sooner, the more options there are.",
        "Cancel your sign-up in advance if your plans change: the spot goes to the next person in the queue.",
      ],
    },
    cancellations: {
      title: "Cancellations and no-shows",
      cutoff:
        "You can cancel without consequences until sign-up for the hike closes — the time is on the hike page. After that the cancellation is late: the spot is hard to pass on, and the group loses someone it was counting on.",
      weights:
        "A late cancellation gets {late}, a no-show without cancelling gets {noShow}. A strike expires on its own after the club's next {lifetime}.",
      threshold:
        "With {threshold} or more you can only join the waitlist until they expire. If a spot opens up, the leader can take you from the waitlist.",
      excuse:
        "Got sick or something came up — message the leader: they'll remove the strike. Not showing up without telling anyone is the worst thing you can do to a group: people are waiting for you at the meeting point.",
      privacy:
        "Only you and the leaders see your strikes. Leaving the waitlist or being removed by a leader gives no strikes.",
    },
    lost: {
      title: "If you lose the group",
      steps: [
        "Stop. Don't try to catch up with the group on an unfamiliar trail.",
        "Call the leader. Their number is in the hike's WhatsApp chat.",
        "If there's no signal, stay where you are and on the trail. That's exactly where people will search — along the group's route.",
        "Don't take a “shortcut” down a stream bed or a slope. In the mountains around Almaty it's the most common reason rescuers have to search for people.",
      ],
    },
    cancel: {
      title: "When a hike is cancelled",
      paragraphs: [
        "Hikes are cancelled for storm warnings, thunderstorms, avalanche danger and simply poor visibility. The leader decides, usually the evening before or on the morning of the hike.",
        "A cancellation is a normal part of how the club works, not a failure. The mountain isn't going anywhere.",
      ],
    },
    minors: {
      title: "If you're under 18",
      paragraphs: [
        "If you're under 18 on the date of the hike, you need a parent's consent and their contact in your profile. The leader sees this mark in the group list.",
        "Consent is a signed paper, not a checkbox on the site. The under-18 form is signed by a parent, not by you. Download it in advance: your parent needs time too.",
      ],
    },
    parents: {
      title: "For parents",
      paragraphs: [
        "The club is part of Narxoz University and hikes routes around Almaty — popular trails, not expeditions. Every group has a responsible leader who has your contact for emergencies.",
        "We don't publish participants' phone numbers or contacts: only the leader of the hike a person has signed up for can see them.",
      ],
    },
    outro:
      "Done reading — next you can pick a hike. What to pack is on the “What to bring” page, by category.",
    ctaHikes: "Upcoming hikes",
    ctaGear: "What to bring",
  },

  gearGuide: {
    metaTitle: "What to bring",
    metaDescription:
      "Gear list by difficulty category: what you need for your first hike and what gets added later.",
    title: "What to bring",
    lead: "The list grows with difficulty: each next category adds what you need on top of what you've already packed.",
    buyNote:
      "You don't need to buy everything at once. For category 1, the only things you may have to look for are a backpack and a rain jacket; trainers with a grippy sole, a water bottle, a snack, and a cap with sunscreen are things almost everyone has. The club doesn't lend gear, but if you're missing something, message the leader before signing up: they'll tell you whether it's really needed on that route.",
    markMine: "Mark what I have",
    editMarks: "Update my marks",
    empty: "The gear list is empty for now.",
    category: "Category {n}",
    nothingNew: "Nothing new — what you packed for the previous categories is enough.",
    outro:
      "Backpack packed — next you can pick a hike. What the club requires on the trail and what to do if you lose the group is in the rules.",
    ctaHikes: "Upcoming hikes",
    ctaRules: "Rules and safety",
  },

  team: {
    metaTitle: "Team",
    metaDescription: "Who leads Step Up club hikes: the leaders, their roles and upcoming routes.",
    title: "Team",
    lead: "Leaders guide the group, know the route and make sure everyone gets back. The rest keep the club running.",
    empty: "The club's team will appear here soon.",
    leads: "Leading",
    recent: "Recently:",
    ctaHikes: "Upcoming hikes",
  },

  og: {
    homeAlt: "Step Up — Narxoz University mountain club",
    homeTitle: "Head to the mountains this weekend",
    homeSubtitle: "Narxoz University student mountain club",
    hikeAlt: "A Step Up club hike",
    hikeNotFound: "Hike not found",
    dateLine: "{date} · starts at {time}",
    category: "Category {n} — {label}",
    spotsLeft: "{left} left of {capacity}",
  },
};
