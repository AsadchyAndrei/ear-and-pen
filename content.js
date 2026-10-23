// Ear & Pen: built-in practice material, shared by the site and the server.
// The server reads this file too: it voices these exact sentences for everyone (no sign-in needed),
// because the list is fixed and small. Anything else needs a signed-in, allowed person.
//
// Dialogue line: [speaker, text]. Vocabulary: [english, russian].

export const TOPICS = [
  { id: "daily",    name: "Повседневные ситуации",                 short: "Повседневные", prompt: "everyday life in the US: neighbors, apartment, small talk, errands" },
  { id: "shop",     name: "Магазины и сервисы",                    short: "Магазины",     prompt: "shopping and services in the US: returns, pharmacy, bills, customer service calls" },
  { id: "travel",   name: "Путешествия",                           short: "Путешествия",  prompt: "travel in the US: hotels, airports, car rental, directions" },
  { id: "doctor",   name: "У врача",                               short: "Врач",         prompt: "visiting a doctor in the US as a patient: appointments, symptoms, insurance, referrals" },
  { id: "school",   name: "Школа и дети",                          short: "Школа",        prompt: "an elementary school in California: talking to teachers and the school office as a parent" },
  { id: "career",   name: "Работа и собеседования",                short: "Карьера",      prompt: "job search in the US: recruiters, interviews, offers, first days at work" },
  { id: "hvac",     name: "HVAC: монтаж и сервис",                 short: "HVAC",         prompt: "working as an HVAC installer or service technician in California: job sites, customers, equipment, safety" },
  { id: "local104", name: "Профсоюз SMART Local 104 (Sheet Metal)", short: "Local 104",    prompt: "working as a union sheet metal worker in SMART Local 104 in the San Francisco Bay Area: apprenticeship, dispatch, job sites, ductwork, foremen, safety" },
  { id: "clinic",   name: "Медицина: медсестра и медассистент",    short: "Медицина",     prompt: "working as a nurse or medical assistant in a California clinic: rooming patients, vital signs, charting, insurance, talking to patients and doctors" },
  { id: "electro",  name: "Электроэпиляция: работа электролога",   short: "Электролог",   prompt: "working as an electrologist (electrolysis hair removal) in California: booking, consultations, treatment, aftercare, state licensing" },
  { id: "court",    name: "Иммиграционный суд и убежище",          short: "Суд",          prompt: "US immigration court and asylum cases: master calendar and individual hearings, the judge, attorneys, interpreters, forms like I-589" },
];
export const topicById = id => TOPICS.find(t => t.id === id);

export const DIALOGS = [
  // ---------- everyday ----------
  { id: "daily-1", topic: "daily", level: "A2", title: "Ordering at a café", context_ru: "Вы заказываете кофе и выпечку в кафе.", speakers: { A: "Barista", B: "Customer" },
    lines: [["A", "Hi there! What can I get for you today?"], ["B", "Can I get a medium latte with oat milk, please?"], ["A", "Sure. Would you like anything to eat with that?"], ["B", "Maybe a blueberry muffin. Are they fresh?"], ["A", "They came out of the oven about twenty minutes ago."], ["B", "Perfect, I'll take one. Can I pay with my phone?"], ["A", "Of course. Just tap it on the reader when you're ready."]],
    vocab: [["What can I get for you?", "Что вам предложить?"], ["oat milk", "овсяное молоко"], ["came out of the oven", "только из духовки"], ["tap it on the reader", "приложите к терминалу"]] },
  { id: "daily-2", topic: "daily", level: "B1", title: "A leak under the sink", context_ru: "Вы звоните управляющему дома: под раковиной течёт.", speakers: { A: "Tenant", B: "Property manager" },
    lines: [["A", "Hi, this is Anna from unit 4B. I think there's a leak under my kitchen sink."], ["B", "Thanks for letting us know. Is it dripping right now, or is it just damp?"], ["A", "It's dripping pretty steadily. I put a bowl under it, but it fills up every couple of hours."], ["B", "Okay, don't use that sink for now. Can you turn off the valve under the cabinet?"], ["A", "I tried, but it's stuck. I didn't want to force it and make things worse."], ["B", "Good call. I'll send our maintenance guy over this afternoon, probably between two and four."], ["A", "That works. Do I need to be home, or can he use his key?"], ["B", "He can let himself in, but we'll text you before he comes."]],
    vocab: [["thanks for letting us know", "спасибо, что сообщили"], ["dripping pretty steadily", "капает постоянно"], ["Good call.", "Правильно сделали."], ["let himself in", "войти своим ключом"]] },
  { id: "daily-3", topic: "daily", level: "B2", title: "Meeting a new neighbor", context_ru: "Сосед знакомится с вами после переезда.", speakers: { A: "Neighbor", B: "You" },
    lines: [["A", "Hey, you must be the new folks in number twelve. I'm Mark, I live right across the street."], ["B", "Nice to meet you, Mark. We moved in last weekend, so everything's still in boxes."], ["A", "Oh, I remember that stage. If you need a ladder or a drill, just knock. I've got pretty much everything in my garage."], ["B", "That's really kind of you. Is there anything we should know about the neighborhood?"], ["A", "Well, street sweeping is on Tuesdays, so don't leave your car out front on Monday night, or you'll get a ticket."], ["B", "Good to know. We would've found that out the hard way."], ["A", "Everyone does once. Also, the farmers market on Sundays is worth checking out."], ["B", "Sounds great. We'll have you over for dinner once we've unpacked."]],
    vocab: [["the new folks", "новенькие"], ["just knock", "просто постучите"], ["find out the hard way", "узнать на горьком опыте"], ["worth checking out", "стоит сходить"], ["have you over", "пригласить вас к себе"]] },

  // ---------- shopping and services ----------
  { id: "shop-1", topic: "shop", level: "A2", title: "Returning a jacket", context_ru: "Вы возвращаете в магазин куртку, которая не подошла.", speakers: { A: "Clerk", B: "Customer" },
    lines: [["A", "Hi! How can I help you?"], ["B", "I'd like to return this jacket. It's too small."], ["A", "Sure. Do you have the receipt?"], ["B", "Yes, here it is. I paid with my card."], ["A", "Thanks. Would you like a refund or a different size?"], ["B", "Do you have it in a large?"], ["A", "Let me check. Yes, we have one in black and one in gray."], ["B", "The black one, please."]],
    vocab: [["return", "вернуть товар"], ["receipt", "чек"], ["refund", "возврат денег"], ["in a large", "размера L"]] },
  { id: "shop-2", topic: "shop", level: "B1", title: "At the pharmacy counter", context_ru: "Вы пришли в аптеку забрать лекарство по рецепту.", speakers: { A: "Pharmacist", B: "Customer" },
    lines: [["B", "Hi, I'm here to pick up a prescription for Daniel Petrov."], ["A", "Can I get his date of birth, please?"], ["B", "March twelfth, nineteen eighty-five."], ["A", "Thanks. It looks like it's not ready yet. We're waiting on approval from his insurance."], ["B", "Oh. How long does that usually take?"], ["A", "Usually a day or two. If you'd like, I can check what it would cost without insurance."], ["B", "Sure, just so I know."], ["A", "It would be about forty dollars. Or you can wait, and we'll text you when it's ready."], ["B", "I'll wait for the text. Thanks for checking."]],
    vocab: [["pick up a prescription", "забрать лекарство по рецепту"], ["waiting on approval", "ждём одобрения"], ["just so I know", "просто чтобы знать"]] },
  { id: "shop-3", topic: "shop", level: "B2", title: "Disputing a bill", context_ru: "Вы звоните провайдеру: счёт за интернет вырос.", speakers: { A: "Agent", B: "Customer" },
    lines: [["A", "Thank you for calling. This call may be recorded. How can I help you today?"], ["B", "Hi, I'm calling about my internet bill. I was charged eighty-nine dollars, but my plan is supposed to be fifty-five."], ["A", "I'm sorry about that. Let me pull up your account. Can you verify the address on file?"], ["B", "Sure, it's 1480 Oak Avenue, apartment seven."], ["A", "Thanks. I see what happened. Your promotional rate expired last month."], ["B", "Nobody told me it was going to expire. Is there anything you can do?"], ["A", "I can apply a loyalty discount, which would bring it down to sixty a month for the next twelve months."], ["B", "That's better, but could you also credit me the difference for this month?"], ["A", "I can do that. You'll see a credit of twenty-nine dollars on your next statement."]],
    vocab: [["pull up your account", "открыть ваш аккаунт"], ["promotional rate", "акционный тариф"], ["loyalty discount", "скидка постоянного клиента"], ["credit me the difference", "вернуть мне разницу"], ["statement", "счёт, выписка"]] },

  // ---------- travel ----------
  { id: "travel-1", topic: "travel", level: "A2", title: "At the hotel front desk", context_ru: "Вы заселяетесь в гостиницу.", speakers: { A: "Clerk", B: "Guest" },
    lines: [["A", "Good evening. Checking in?"], ["B", "Yes. I have a reservation under Ivanova."], ["A", "Here it is. Two nights, a queen room. Can I see your ID and a credit card?"], ["B", "Here you go. What time is breakfast?"], ["A", "From six thirty to ten, on the first floor."], ["B", "And what's the Wi-Fi password?"], ["A", "It's on the card with your room key. You're in room 314."], ["B", "Thank you. Have a good night."]],
    vocab: [["Checking in?", "Заселяетесь?"], ["a reservation under", "бронь на имя"], ["Here you go.", "Вот, пожалуйста."], ["queen room", "номер с большой кроватью"]] },
  { id: "travel-2", topic: "travel", level: "B1", title: "A delayed flight", context_ru: "Ваш рейс задерживается, и вы не успеваете на пересадку.", speakers: { A: "Gate agent", B: "Passenger" },
    lines: [["B", "Excuse me, the screen says my flight to Denver is delayed. Do you know how long?"], ["A", "Right now it's about two hours. The incoming plane is late because of weather in Chicago."], ["B", "I have a connection in Denver at six. I'm going to miss it, aren't I?"], ["A", "Probably. Let me see what I can do. I can rebook you on the eight forty flight to Salt Lake City."], ["B", "Is there anything earlier?"], ["A", "There's a four fifteen, but it's oversold. I can put you on the standby list."], ["B", "Let's do that, and keep me on the eight forty just in case."], ["A", "Done. Here's a meal voucher for the wait."]],
    vocab: [["incoming plane", "прибывающий самолёт"], ["connection", "пересадка"], ["rebook", "перебронировать"], ["oversold", "продано больше мест, чем есть"], ["standby list", "лист ожидания"], ["just in case", "на всякий случай"]] },
  { id: "travel-3", topic: "travel", level: "B2", title: "Renting a car", context_ru: "Вы берёте машину в аренду в аэропорту.", speakers: { A: "Agent", B: "Customer" },
    lines: [["A", "Welcome. Do you have a reservation with us?"], ["B", "I do. It's for a compact car for five days, under Smirnov."], ["A", "Got it. Would you like to add our collision damage waiver? It covers any damage to the vehicle."], ["B", "I think my credit card already covers that, so I'll pass."], ["A", "No problem. Just so you know, you'll need to return it with a full tank, or we'll charge you for the fuel at our rate."], ["B", "Understood. Is there a toll pass in the car? We're driving across the Golden Gate Bridge."], ["A", "There is. Tolls are billed automatically, plus a small daily fee on the days you use it."], ["B", "That's fine. Could you note the scratch on the rear bumper before I leave?"]],
    vocab: [["collision damage waiver", "страховка от повреждений машины"], ["I'll pass.", "Откажусь."], ["a full tank", "полный бак"], ["toll pass", "транспондер для платных дорог"], ["rear bumper", "задний бампер"]] },

  // ---------- doctor (as a patient) ----------
  { id: "doctor-1", topic: "doctor", level: "A2", title: "Making an appointment", context_ru: "Вы звоните в клинику, чтобы записаться к врачу.", speakers: { A: "Receptionist", B: "Patient" },
    lines: [["A", "Good morning, Valley Family Clinic. How can I help you?"], ["B", "Hi. I'd like to make an appointment with Dr. Lee."], ["A", "Are you a new patient?"], ["B", "No, I've been here before."], ["A", "What's the appointment for?"], ["B", "I have a sore throat and a fever."], ["A", "Dr. Lee has an opening tomorrow at nine fifteen. Does that work?"], ["B", "Yes, that's perfect. Thank you."]],
    vocab: [["make an appointment", "записаться на приём"], ["sore throat", "боль в горле"], ["an opening", "свободное окно"], ["Does that work?", "Вам подходит?"]] },
  { id: "doctor-2", topic: "doctor", level: "B1", title: "Describing symptoms", context_ru: "На приёме вы рассказываете врачу о головной боли.", speakers: { A: "Doctor", B: "Patient" },
    lines: [["A", "So, what brings you in today?"], ["B", "I've had a headache for about a week, and it gets worse in the afternoon."], ["A", "Have you noticed anything that makes it better or worse?"], ["B", "It's worse when I'm staring at my computer for a long time."], ["A", "Are you sleeping well? And how much water do you drink during the day?"], ["B", "Not much, honestly. Mostly coffee."], ["A", "Okay. Let's check your blood pressure and your eyes first."], ["B", "Should I be worried?"], ["A", "It's probably nothing serious, but I'd like to rule a few things out."]],
    vocab: [["What brings you in?", "С чем вы пришли?"], ["staring at", "смотреть, не отрываясь"], ["rule out", "исключить"]] },
  { id: "doctor-3", topic: "doctor", level: "B2", title: "A referral and insurance", context_ru: "Вас направили к дерматологу, но он не входит в вашу страховку.", speakers: { A: "Receptionist", B: "Patient" },
    lines: [["B", "Hi, my doctor referred me to a dermatologist, but your office says you're out of network."], ["A", "That's right. Your plan is an HMO, so you need to see a specialist within your medical group."], ["B", "So if I see someone out of network, I'd have to pay for the whole thing myself?"], ["A", "Unless it's an emergency, yes. I'd recommend asking your primary care doctor for a new referral."], ["B", "How long does a referral usually take to go through?"], ["A", "Typically three to five business days. You can check the status in your patient portal."], ["B", "Okay. And once it's approved, do I call the specialist directly?"], ["A", "Yes, the referral will list their number. Just mention your authorization number when you call."]],
    vocab: [["referred me to", "направил меня к"], ["out of network", "не входит в сеть страховки"], ["primary care doctor", "основной врач (терапевт)"], ["go through", "пройти (одобрение)"], ["patient portal", "личный кабинет пациента"]] },

  // ---------- school ----------
  { id: "school-1", topic: "school", level: "A2", title: "Picking up early", context_ru: "Вы забираете дочь из школы раньше, к стоматологу.", speakers: { A: "Office staff", B: "Parent" },
    lines: [["B", "Hi, I need to pick up my daughter early today. She has a dentist appointment."], ["A", "No problem. What's her name and grade?"], ["B", "Maya Orlova, fourth grade, Ms. Garcia's class."], ["A", "Can I see your ID? I need to check that you're on her pickup list."], ["B", "Sure, here it is."], ["A", "Thank you. Please sign her out here, and write the time."], ["B", "Okay. Will she miss anything important?"], ["A", "Just math. I'll let Ms. Garcia know."]],
    vocab: [["pick up early", "забрать раньше"], ["pickup list", "список тех, кто может забирать"], ["sign her out", "расписаться, что забираете"]] },
  { id: "school-2", topic: "school", level: "B1", title: "Parent-teacher conference", context_ru: "Учитель рассказывает, как сын учится.", speakers: { A: "Teacher", B: "Parent" },
    lines: [["A", "Thanks for coming in. Overall, Leo's doing really well this year."], ["B", "That's great to hear. Is there anything he's struggling with?"], ["A", "His reading is strong, but he rushes through his math homework and makes careless mistakes."], ["B", "I've noticed that too. He wants to finish quickly so he can play."], ["A", "One thing that helps is asking him to check two problems before he turns it in."], ["B", "That's a good idea. We'll try that at home."], ["A", "And please keep reading with him. It really shows."]],
    vocab: [["struggling with", "даётся с трудом"], ["rushes through", "делает наспех"], ["careless mistakes", "ошибки по невнимательности"], ["turns it in", "сдаёт"], ["It really shows.", "Это заметно."]] },
  { id: "school-3", topic: "school", level: "B2", title: "After-school program", context_ru: "Вы хотите записать сына на продлёнку.", speakers: { A: "Coordinator", B: "Parent" },
    lines: [["B", "Hi, I'm interested in the after-school program for my son. Is there still space?"], ["A", "We have a waitlist right now, but spots open up fairly often. Which days would you need?"], ["B", "Monday through Thursday, until about five thirty."], ["A", "Our program runs until six, so that works. Fees are on a sliding scale, depending on household income."], ["B", "Do the kids get help with homework, or is it mostly playtime?"], ["A", "The first hour is homework time with staff, and after that they can choose an activity."], ["B", "Sounds perfect. What do I need to fill out to get on the waitlist?"], ["A", "Just this form and a copy of his immunization record."]],
    vocab: [["waitlist", "лист ожидания"], ["spots open up", "освобождаются места"], ["sliding scale", "оплата в зависимости от дохода"], ["immunization record", "справка о прививках"]] },

  // ---------- career ----------
  { id: "career-1", topic: "career", level: "A2", title: "A call from a recruiter", context_ru: "Вам звонят по поводу вакансии на складе.", speakers: { A: "Recruiter", B: "Candidate" },
    lines: [["A", "Hi, is this Pavel? This is Jessica from Bay Staffing."], ["B", "Yes, this is Pavel. Hi, Jessica."], ["A", "You applied for the warehouse position. Are you still interested?"], ["B", "Yes, I am."], ["A", "Great. Can you come in for an interview on Thursday at ten?"], ["B", "Thursday at ten is fine. What's the address?"], ["A", "I'll email it to you right now. Please bring your ID."], ["B", "Thank you. See you on Thursday."]],
    vocab: [["applied for", "откликнулись на"], ["position", "вакансия"], ["come in for an interview", "прийти на собеседование"]] },
  { id: "career-2", topic: "career", level: "B1", title: "Tell me about yourself", context_ru: "Начало собеседования.", speakers: { A: "Interviewer", B: "Candidate" },
    lines: [["A", "So, tell me a little about yourself."], ["B", "Sure. I've worked in customer service for about five years, mostly in retail."], ["A", "And why are you interested in this position?"], ["B", "I'd like to move into a role where I can use my experience but also learn new skills."], ["A", "What would you say is your biggest strength?"], ["B", "I stay calm under pressure, especially when customers are upset."], ["A", "Can you give me an example?"], ["B", "Last holiday season, our system went down, and I handled a long line of customers until it was fixed."]],
    vocab: [["move into a role", "перейти на должность"], ["stay calm under pressure", "сохранять спокойствие в стрессе"], ["went down", "упала, перестала работать"]] },
  { id: "career-3", topic: "career", level: "B2", title: "Negotiating an offer", context_ru: "Вам предложили работу, и вы обсуждаете ставку.", speakers: { A: "Hiring manager", B: "Candidate" },
    lines: [["A", "We'd love to have you on the team. We're offering twenty-eight dollars an hour, full-time, with benefits."], ["B", "Thank you, I'm really excited about the offer. I was hoping for something closer to thirty-two, given my certifications."], ["A", "I understand. Thirty-two is above our range for this role, but I could go up to thirty."], ["B", "I appreciate that. Would you be open to revisiting it after a ninety-day review?"], ["A", "That's reasonable. If your review goes well, we can bring it to thirty-two."], ["B", "Could we put that in the offer letter?"], ["A", "I'll check with HR, but I don't see why not."], ["B", "Then I think we have a deal. When would you like me to start?"]],
    vocab: [["benefits", "соцпакет"], ["given my certifications", "учитывая мои сертификаты"], ["above our range", "выше нашей вилки"], ["revisiting it", "пересмотреть это"], ["offer letter", "письменное предложение о работе"]] },

  // ---------- HVAC ----------
  { id: "hvac-1", topic: "hvac", level: "A2", title: "First day on the job", context_ru: "Ваш первый день помощником монтажника.", speakers: { A: "Lead installer", B: "Helper" },
    lines: [["A", "Morning! You're the new helper, right?"], ["B", "Yes, I'm Alex. Nice to meet you."], ["A", "Nice to meet you too. Do you have your boots and gloves?"], ["B", "Yes, they're in my car."], ["A", "Good. Today we're putting in a new furnace in the attic."], ["B", "Okay. What do you need me to do first?"], ["A", "Grab the ladder and the drop cloths from the truck."], ["B", "Got it. I'll be right back."]],
    vocab: [["putting in", "устанавливаем"], ["furnace", "газовая печь отопления"], ["attic", "чердак"], ["drop cloths", "защитные покрытия на пол"], ["Got it.", "Понял."]] },
  { id: "hvac-2", topic: "hvac", level: "B1", title: "A service call", context_ru: "Техник приехал к хозяину дома, у которого плохо работает кондиционер.", speakers: { A: "Technician", B: "Homeowner" },
    lines: [["B", "Thanks for coming out so quickly. The upstairs bedrooms just won't cool down."], ["A", "No problem. When did you first notice the issue?"], ["B", "About three days ago. The fan is running, but the air coming out feels warm."], ["A", "Have you changed the air filter recently?"], ["B", "Honestly, I can't remember the last time I did."], ["A", "Let's start there. A clogged filter can restrict airflow and cause the coil to freeze."], ["B", "Is that something I could have fixed myself?"], ["A", "The filter, yes. But I'd still like to check the refrigerant pressure while I'm here."]],
    vocab: [["won't cool down", "никак не охлаждаются"], ["clogged filter", "забитый фильтр"], ["restrict airflow", "ограничивать поток воздуха"], ["could have fixed", "мог бы починить (в прошлом)"], ["while I'm here", "раз уж я здесь"]] },
  { id: "hvac-3", topic: "hvac", level: "B2", title: "A heat pump upgrade", context_ru: "Техник объясняет, почему стоит поставить тепловой насос.", speakers: { A: "Technician", B: "Homeowner" },
    lines: [["B", "So you're saying we should replace the whole system, not just the AC?"], ["A", "I'd recommend it. Your furnace is twenty years old, and a heat pump would handle both heating and cooling."], ["B", "Isn't a heat pump less effective when it's cold outside?"], ["A", "Older ones were, but here in the Bay Area it rarely gets cold enough for that to matter."], ["B", "What about the cost? I've heard there are rebates."], ["A", "There are some through the utility. I can check which ones you'd qualify for."], ["B", "And how long would the installation take?"], ["A", "Usually two days, plus pulling a permit and scheduling the final inspection."]],
    vocab: [["heat pump", "тепловой насос"], ["handle", "обеспечивать, справляться"], ["rebates", "компенсации части стоимости"], ["qualify for", "иметь право на"], ["pulling a permit", "получение разрешения"], ["final inspection", "итоговая инспекция"]] },

  // ---------- SMART Local 104 (sheet metal) ----------
  { id: "local104-1", topic: "local104", level: "A2", title: "At the union hall", context_ru: "Вы пришли в профсоюз записаться в список ожидающих работу.", speakers: { A: "Dispatcher", B: "Member" },
    lines: [["B", "Hi, I'm here to sign the out-of-work list."], ["A", "Okay. Can I see your union card?"], ["B", "Here it is."], ["A", "Thanks. What kind of work are you looking for?"], ["B", "HVAC duct installation. I can also do some welding."], ["A", "Good, I'll put that down. We call people in order, so keep your phone on."], ["B", "Thank you. When do you usually call?"], ["A", "Every morning, before seven."]],
    vocab: [["union hall", "офис профсоюза"], ["out-of-work list", "список ожидающих работу"], ["union card", "членский билет"], ["in order", "по очереди"]] },
  { id: "local104-2", topic: "local104", level: "B1", title: "Laying out ductwork", context_ru: "Мастер объясняет ученику, как вести воздуховод.", speakers: { A: "Foreman", B: "Apprentice" },
    lines: [["A", "Okay, we're running the main trunk line down this hallway, and then branching off to each office."], ["B", "Where do you want the hangers?"], ["A", "Every eight feet, and within two feet of every fitting. Use the all-thread and the strut from the gang box."], ["B", "Got it. Should I check the drawings for the ceiling height?"], ["A", "Yes. We need at least four inches of clearance below the sprinkler pipes."], ["B", "What if the duct doesn't fit there?"], ["A", "Then let me know before you cut anything. We'll ask the engineer about a change."], ["B", "Okay. I'll measure twice and check with you first."]],
    vocab: [["main trunk line", "магистральный воздуховод"], ["branching off", "ответвления"], ["hangers", "подвесы"], ["all-thread", "резьбовая шпилька"], ["gang box", "инструментальный ящик на объекте"], ["clearance", "зазор"]] },
  { id: "local104-3", topic: "local104", level: "B2", title: "An apprenticeship interview", context_ru: "Собеседование на программу ученичества (apprenticeship).", speakers: { A: "Interviewer", B: "Candidate" },
    lines: [["A", "So, tell me why you're interested in this apprenticeship program."], ["B", "I've been working as an install helper, and I'd like to build a long-term career in the trade."], ["A", "What would you say is the most valuable thing you've learned on the job?"], ["B", "Probably that a clean, well-planned install saves a lot of trouble down the road."], ["A", "How do you handle it when a senior installer asks you to do something you think is wrong?"], ["B", "I'd ask about it respectfully. Sometimes there's a reason I hadn't considered."], ["A", "That's a good answer. Do you have any questions for us?"], ["B", "Yes. How is the time split between classroom training and work in the field?"]],
    vocab: [["the trade", "ремесло, профессия"], ["down the road", "в будущем"], ["hadn't considered", "не учёл"], ["in the field", "на объектах"]] },

  // ---------- clinic: nurse and medical assistant ----------
  { id: "clinic-1", topic: "clinic", level: "A2", title: "Rooming a patient", context_ru: "Медассистент встречает пациента и проводит в кабинет.", speakers: { A: "Medical assistant", B: "Patient" },
    lines: [["A", "Hi, Mr. Lopez? I'm Sara, the medical assistant. Come on back."], ["B", "Hi. Thank you."], ["A", "Please step on the scale for me. Great. Now have a seat here."], ["B", "Okay."], ["A", "I'm going to take your blood pressure. Please relax your arm."], ["B", "Sure."], ["A", "What brings you in today?"], ["B", "I need a refill on my blood pressure medicine."], ["A", "Okay. The doctor will be in shortly."]],
    vocab: [["Come on back.", "Проходите."], ["step on the scale", "встаньте на весы"], ["refill", "продление рецепта"], ["shortly", "скоро"]] },
  { id: "clinic-2", topic: "clinic", level: "B1", title: "High blood pressure", context_ru: "Медассистент сообщает медсестре о высоком давлении у пациента.", speakers: { A: "Nurse", B: "Medical assistant" },
    lines: [["B", "Hey, Linda, do you have a minute? I just roomed the patient in room three."], ["A", "Sure, what's going on?"], ["B", "Her blood pressure is one eighty over a hundred and ten, and she says she has a bad headache."], ["A", "Did you recheck it?"], ["B", "Yes, I took it again on the other arm after five minutes. It was about the same."], ["A", "Okay, good job flagging it. I'll go see her now, and I'll let Dr. Patel know."], ["B", "Should I do anything while we wait?"], ["A", "Just put her vitals in the chart and stay close in case we need an EKG."]],
    vocab: [["roomed the patient", "провела пациента в кабинет"], ["recheck", "перемерить"], ["flagging it", "что сразу сообщила"], ["vitals", "основные показатели"], ["chart", "медицинская карта"]] },
  { id: "clinic-3", topic: "clinic", level: "B2", title: "A prior authorization", context_ru: "Пациент звонит: МРТ не назначают, страховка ещё не одобрила.", speakers: { A: "Medical assistant", B: "Patient" },
    lines: [["B", "Hi, I'm calling about the MRI my doctor ordered. The imaging center says they can't schedule it yet."], ["A", "Let me take a look. It looks like your insurance requires a prior authorization, and it's still pending."], ["B", "What does that mean, exactly?"], ["A", "It means your insurance has to approve it before you get the scan, or they may not pay for it."], ["B", "How long will that take? My knee is getting worse."], ["A", "Usually five to seven business days, but the doctor can request an expedited review if it's urgent."], ["B", "Could you ask her to do that?"], ["A", "I'll send her a message right now, and I'll call you as soon as we hear back."]],
    vocab: [["ordered", "назначил"], ["prior authorization", "предварительное одобрение страховки"], ["pending", "на рассмотрении"], ["expedited review", "ускоренное рассмотрение"], ["hear back", "получить ответ"]] },

  // ---------- electrology ----------
  { id: "electro-1", topic: "electro", level: "A2", title: "Booking a first session", context_ru: "Клиентка записывается на первый сеанс электроэпиляции.", speakers: { A: "Electrologist", B: "Client" },
    lines: [["B", "Hi, I'd like to book a session for electrolysis."], ["A", "Sure. Is this your first time?"], ["B", "Yes, it is."], ["A", "Then we'll start with a free consultation. What area would you like to treat?"], ["B", "My upper lip and chin."], ["A", "Okay. I have an opening on Saturday at eleven."], ["B", "Great. How long is the appointment?"], ["A", "About thirty minutes. Please don't wax or pluck for two weeks before."]],
    vocab: [["book a session", "записаться на сеанс"], ["electrolysis", "электроэпиляция"], ["consultation", "консультация"], ["pluck", "выщипывать"]] },
  { id: "electro-2", topic: "electro", level: "B1", title: "The consultation", context_ru: "Электролог объясняет, как проходит процедура.", speakers: { A: "Electrologist", B: "Client" },
    lines: [["B", "How does electrolysis work, exactly?"], ["A", "I insert a very fine probe into each hair follicle and send a small current to destroy the root."], ["B", "Does it hurt?"], ["A", "Most people feel a quick sting or a bit of heat. I can adjust the setting so it's comfortable."], ["B", "How many sessions will I need?"], ["A", "It depends on the area and your hair growth cycle, but usually several sessions over a few months."], ["B", "Is it really permanent?"], ["A", "Yes. Once a follicle is treated successfully, that hair won't grow back."]],
    vocab: [["probe", "зонд (игла)"], ["hair follicle", "волосяной фолликул"], ["current", "ток"], ["sting", "укол, жжение"], ["growth cycle", "цикл роста"], ["permanent", "навсегда"]] },
  { id: "electro-3", topic: "electro", level: "B2", title: "Aftercare and the state board", context_ru: "Опытный электролог даёт советы новой коллеге.", speakers: { A: "Senior electrologist", B: "New electrologist" },
    lines: [["A", "Before your client leaves, always go over the aftercare. What do you usually tell them?"], ["B", "To keep the area clean, skip makeup for twenty-four hours, and not to pick at any scabs."], ["A", "Good. And remind them that some redness or small bumps are normal for a day or two."], ["B", "Got it. By the way, how did you prepare for your state board exam?"], ["A", "Mostly by drilling sanitation. They're very strict about it."], ["B", "That's what I'm worried about. I keep forgetting to change gloves between steps."], ["A", "Make a checklist and practice it until it's automatic."], ["B", "Thanks, I'll do that. I really want to pass on the first try."]],
    vocab: [["go over", "проговорить, пройтись по"], ["aftercare", "уход после процедуры"], ["pick at scabs", "сдирать корочки"], ["redness", "покраснение"], ["state board exam", "экзамен на лицензию штата"], ["on the first try", "с первой попытки"]] },

  // ---------- immigration court ----------
  { id: "court-1", topic: "court", level: "A2", title: "Checking in at the court", context_ru: "Вы пришли на заседание в иммиграционный суд.", speakers: { A: "Clerk", B: "Respondent" },
    lines: [["A", "Good morning. What's your name?"], ["B", "My name is Oleg Ivanov. I have a hearing at nine."], ["A", "Do you have your A-number?"], ["B", "Yes, it's on my letter."], ["A", "Thank you. Your hearing is in courtroom five, on the fourth floor."], ["B", "Will there be an interpreter?"], ["A", "Did you ask for one?"], ["B", "Yes, for Russian."], ["A", "Then the interpreter will be there. Please turn off your phone in the courtroom."]],
    vocab: [["hearing", "заседание"], ["A-number", "регистрационный номер иностранца"], ["courtroom", "зал суда"], ["interpreter", "переводчик (устный)"]] },
  { id: "court-2", topic: "court", level: "B1", title: "A master calendar hearing", context_ru: "Первое (организационное) заседание у иммиграционного судьи.", speakers: { A: "Judge", B: "Respondent" },
    lines: [["A", "Good morning. This is a master calendar hearing. Sir, do you have an attorney?"], ["B", "Not yet, Your Honor. I'm still looking for one."], ["A", "I'll give you more time to find a lawyer. Here's a list of free legal service providers."], ["B", "Thank you, Your Honor."], ["A", "Do you understand why you're here today?"], ["B", "Yes. The government says I'm removable, and I want to apply for asylum."], ["A", "All right. Your next hearing will be on March fifth at one p.m. If you don't come, you could be ordered removed in your absence."], ["B", "I understand. I'll be there."]],
    vocab: [["master calendar hearing", "предварительное заседание"], ["Your Honor", "Ваша честь"], ["removable", "подлежащий высылке"], ["apply for asylum", "просить убежища"], ["ordered removed in your absence", "приказ о высылке заочно"]] },
  { id: "court-3", topic: "court", level: "B2", title: "Preparing for the individual hearing", context_ru: "Адвокат готовит клиента к основному заседанию по делу об убежище.", speakers: { A: "Attorney", B: "Client" },
    lines: [["A", "At your individual hearing, the judge and the government attorney will ask you about everything in your I-589."], ["B", "What if I don't remember an exact date?"], ["A", "Then say you don't remember. Never guess. It's better to be honest than to give a date that contradicts your declaration."], ["B", "Should I bring the original documents?"], ["A", "Yes, bring the originals of everything we submitted, along with the translations."], ["B", "How long does the hearing usually last?"], ["A", "It could take a few hours. Take your time, listen to each question, and wait for the interpreter to finish."], ["B", "Okay. I'm nervous, but I feel more prepared now."]],
    vocab: [["individual hearing", "основное заседание по существу"], ["government attorney", "представитель правительства (DHS)"], ["I-589", "заявление на убежище"], ["contradicts your declaration", "противоречит вашим письменным показаниям"], ["originals", "оригиналы"]] },
];

// Sentences to translate: [level, russian, english, focus, hint]
const S = (topic, rows) => rows.map(([level, ru, en, focus, hint_ru]) => ({ topic, level, ru, en, focus, hint_ru }));
export const SENTENCES = [
  ...S("daily", [
    ["A2", "Я живу здесь три года.", "I've lived here for three years.", "Present Perfect + for", "Действие началось в прошлом и длится до сих пор: have + V3 + for."],
    ["A2", "Можно мне стакан воды, пожалуйста?", "Can I have a glass of water, please?", "Can I have…?", "Вежливая просьба о чём-то для себя: Can I have…?"],
    ["B1", "Не могли бы вы говорить чуть медленнее? Я понимаю не всё.", "Could you speak a little more slowly? I don't understand everything.", "Polite requests", "Вежливая просьба начинается с Could you…"],
    ["B1", "Чем больше практикуешься, тем легче становится.", "The more you practice, the easier it gets.", "the more … the …", "Обе части начинаются с the."],
    ["B1", "Мы опоздали, потому что застряли в пробке на 101-м.", "We were late because we got stuck in traffic on the 101.", "get stuck · articles", "Калифорнийские шоссе называют с артиклем: the 101."],
    ["B2", "Лучше позвони заранее, а то их может не быть на месте.", "You'd better call ahead, or they might not be there.", "had better · might", "«Лучше сделай» — had better без to."],
  ]),
  ...S("shop", [
    ["A2", "Сколько стоят эти ботинки?", "How much are these boots?", "How much are…?", "Boots — множественное число, поэтому are."],
    ["A2", "У вас есть это в другом цвете?", "Do you have this in another color?", "in + color / size", "Цвет и размер — с предлогом in: in another color, in a large."],
    ["B1", "Я хотел бы вернуть это. У меня есть чек.", "I'd like to return this. I have the receipt.", "I'd like to…", "Вежливое «хотел бы» — I'd like to + глагол."],
    ["B1", "Мне сказали, что заказ придёт в пятницу.", "I was told the order would arrive on Friday.", "Passive · would", "«Мне сказали» — I was told; после прошедшего времени will становится would."],
    ["B2", "Если бы я знал, что тариф изменится, я бы не подписывал договор.", "If I had known the rate would change, I wouldn't have signed the contract.", "Third conditional", "Нереальное условие в прошлом: If + had + V3, would have + V3."],
    ["B2", "Я уже третий раз звоню по этому поводу.", "This is the third time I've called about this.", "This is the … time + Present Perfect", "После This is the first/second/third time — Present Perfect."],
  ]),
  ...S("travel", [
    ["A2", "Где ближайшая автобусная остановка?", "Where's the nearest bus stop?", "the nearest", "Превосходная степень — с артиклем the."],
    ["A2", "Мой рейс задерживается на два часа.", "My flight is delayed by two hours.", "delayed by", "«На сколько» — предлог by."],
    ["B1", "Я забронировал номер на двоих на три ночи.", "I booked a room for two people for three nights.", "for … for", "И «на двоих», и «на три ночи» — с предлогом for."],
    ["B1", "Пока мы ждали посадку, я успел поесть.", "While we were waiting to board, I managed to eat.", "Past Continuous · manage to", "Длительное действие в прошлом — was/were + -ing; «успел» — managed to."],
    ["B2", "Если бы мы не опоздали на пересадку, мы бы уже были дома.", "If we hadn't missed our connection, we'd be home by now.", "Mixed conditional", "Условие в прошлом, результат сейчас: If + had + V3, would + глагол."],
    ["B2", "Нам посоветовали взять машину напрокат, а не ездить на такси.", "We were advised to rent a car instead of taking taxis.", "Passive · instead of + -ing", "После instead of глагол с -ing."],
  ]),
  ...S("doctor", [
    ["A2", "У меня болит голова со вчерашнего дня.", "I've had a headache since yesterday.", "Present Perfect + since", "Длится до сих пор: have had + since."],
    ["A2", "Мне нужно записаться к врачу.", "I need to make an appointment with a doctor.", "make an appointment", "«Записаться» — make an appointment."],
    ["B1", "Принимайте эту таблетку два раза в день после еды.", "Take this pill twice a day after meals.", "twice a day", "«Два раза в день» — twice a day."],
    ["B1", "Врач сказал мне больше пить воды.", "The doctor told me to drink more water.", "tell someone to", "Совет в косвенной речи: told me to + глагол."],
    ["B2", "Если боль не пройдёт через три дня, вам нужно будет сделать рентген.", "If the pain doesn't go away in three days, you'll need to get an X-ray.", "First conditional · go away", "После if — настоящее время, без will."],
    ["B2", "Моя страховка не покрывает этот анализ.", "My insurance doesn't cover this test.", "cover", "«Покрывать» о страховке — cover."],
  ]),
  ...S("school", [
    ["A2", "Моя дочь учится в четвёртом классе.", "My daughter is in fourth grade.", "be in … grade", "«Учится в классе» — be in … grade."],
    ["A2", "Во сколько заканчиваются уроки?", "What time does school end?", "What time does…?", "Вопрос в Present Simple — с does."],
    ["B1", "Учительница попросила нас проверять его домашнее задание.", "The teacher asked us to check his homework.", "ask someone to", "Просьба в косвенной речи: asked us to + глагол."],
    ["B1", "Чтение ей даётся лучше, чем математика.", "She's better at reading than math.", "good at → better at", "«Даётся» — be good at; сравнение — better at … than."],
    ["B2", "Я бы хотел, чтобы он больше читал по вечерам.", "I'd like him to read more in the evenings.", "would like someone to", "«Хочу, чтобы он…» — I'd like him to + глагол, без that."],
    ["B2", "Если бы он сдал задание вовремя, он бы получил более высокую оценку.", "If he had turned in the assignment on time, he would have gotten a better grade.", "Third conditional · turn in", "Нереальное условие в прошлом; «сдать» — turn in; gotten — американский вариант."],
  ]),
  ...S("career", [
    ["A2", "Я ищу работу на полный день.", "I'm looking for a full-time job.", "full-time", "Перед существительным — через дефис: a full-time job."],
    ["B1", "Я работаю в этой компании с весны.", "I've been working at this company since spring.", "Present Perfect Continuous", "Действие началось в прошлом и продолжается сейчас."],
    ["B1", "Я уже отправил документы, но ответа пока нет.", "I've already sent the documents, but I haven't heard back yet.", "Present Perfect · hear back", "«Ответа нет» естественнее через hear back."],
    ["B2", "Ей посоветовали не подписывать договор, пока юрист его не прочитает.", "She was advised not to sign the contract until a lawyer reads it.", "Passive · until", "После until в английском нет отрицания и нет will."],
    ["B2", "Я привык рано вставать, но мне это до сих пор не нравится.", "I'm used to getting up early, but I still don't like it.", "be used to + -ing", "Не путайте be used to (привык) и used to (раньше делал)."],
    ["B2", "Если бы я знал об этом раньше, я бы тебе позвонил.", "If I had known about it earlier, I would have called you.", "Third conditional", "Нереальное условие в прошлом."],
  ]),
  ...S("hvac", [
    ["A2", "Передай мне, пожалуйста, отвёртку.", "Can you hand me the screwdriver, please?", "hand me", "«Передать» в руки — hand."],
    ["B1", "Кондиционер не включается, хотя термостат работает.", "The AC won't turn on, even though the thermostat is working.", "won't · even though", "«Не включается» о технике часто передают через won't."],
    ["B1", "Мне нужно, чтобы ты проверил давление в системе.", "I need you to check the pressure in the system.", "need someone to do", "Без that и без would: need + кто + to + глагол."],
    ["B1", "Сколько времени у тебя ушло на установку?", "How long did it take you to finish the installation?", "it takes … to", "Конструкция it take(s) someone time to do something."],
    ["B2", "Фильтр не меняли больше года, поэтому змеевик обмёрз.", "The filter hadn't been changed in over a year, so the coil froze up.", "Past Perfect Passive", "Раньше другого события в прошлом и «его не меняли» — hadn't been changed."],
    ["B2", "Прежде чем вскрывать систему, нужно откачать хладагент.", "Before opening the system, you need to recover the refrigerant.", "before + -ing · recover", "После before — глагол с -ing; «откачать хладагент» — recover the refrigerant."],
  ]),
  ...S("local104", [
    ["A2", "Я ученик первого года.", "I'm a first-year apprentice.", "first-year", "Перед существительным — через дефис: a first-year apprentice."],
    ["A2", "Где лежат ножницы по металлу?", "Where are the tin snips?", "plural tools", "Snips, как scissors, всегда во множественном: are."],
    ["B1", "Мастер сказал, что завтра мы начинаем в шесть.", "The foreman said we're starting at six tomorrow.", "Reported speech · plans", "О планах в разговоре можно не менять время: we're starting."],
    ["B1", "Сначала разметь, потом режь.", "Lay it out first, then cut.", "lay out", "«Разметить» — lay out; местоимение между глаголом и частицей: lay it out."],
    ["B2", "Нам нужно закончить воздуховоды до того, как придут электрики.", "We need to finish the ductwork before the electricians get here.", "before + Present Simple", "После before о будущем — настоящее время, без will."],
    ["B2", "Если бы я не был в каске, я бы серьёзно пострадал.", "If I hadn't been wearing a hard hat, I would have been seriously hurt.", "Third conditional · continuous", "Нереальное прошлое: hadn't been wearing; результат — would have been hurt."],
  ]),
  ...S("clinic", [
    ["A2", "Пожалуйста, встаньте на весы.", "Please step on the scale.", "step on", "«Встать на весы» — step on the scale."],
    ["A2", "Когда вы последний раз ели?", "When did you last eat?", "Past Simple question", "Вопрос в прошлом — с did; last стоит перед глаголом."],
    ["B1", "У пациента в третьем кабинете высокое давление.", "The patient in room three has high blood pressure.", "have high blood pressure", "Давление «у кого-то» — has high blood pressure."],
    ["B1", "Мне нужно перемерить вам давление через пять минут.", "I need to recheck your blood pressure in five minutes.", "in + time", "«Через пять минут» — in five minutes, не after."],
    ["B2", "Страховка должна одобрить МРТ, прежде чем мы сможем его назначить.", "Insurance has to approve the MRI before we can schedule it.", "has to · before", "Обязанность — has to; после before — настоящее время."],
    ["B2", "Я внесла показатели в карту, но врач их ещё не посмотрел.", "I entered the vitals in the chart, but the doctor hasn't reviewed them yet.", "Present Perfect · yet", "«Ещё не» — hasn't … yet."],
  ]),
  ...S("electro", [
    ["A2", "Это ваш первый сеанс?", "Is this your first session?", "Is this…?", "Вопрос с to be — глагол в начале."],
    ["A2", "Не выщипывайте волоски перед процедурой.", "Don't pluck the hairs before the treatment.", "Don't + verb", "Отрицательная просьба — Don't + глагол."],
    ["B1", "Вы почувствуете лёгкое тепло или покалывание.", "You'll feel a little heat or a slight sting.", "will · a little / slight", "Будущее — will; «лёгкое» — a little, slight."],
    ["B1", "Сколько сеансов мне понадобится?", "How many sessions will I need?", "How many…?", "Исчисляемые — how many; «понадобится» — will need."],
    ["B2", "Покраснение обычно проходит в течение суток.", "The redness usually goes away within twenty-four hours.", "go away · within", "«Проходит» — goes away; «в течение» — within."],
    ["B2", "Я готовлюсь к экзамену на лицензию штата уже два месяца.", "I've been studying for the state board exam for two months.", "Present Perfect Continuous", "Готовлюсь до сих пор — have been + -ing + for."],
  ]),
  ...S("court", [
    ["A2", "Мне нужен переводчик с русского.", "I need a Russian interpreter.", "interpreter", "Устный переводчик — interpreter (не translator)."],
    ["A2", "Я не понял вопрос. Можете повторить?", "I didn't understand the question. Could you repeat it?", "Could you…?", "Вежливая просьба — Could you…; it после repeat обязательно."],
    ["B1", "Мой адвокат ещё не пришёл.", "My attorney hasn't arrived yet.", "Present Perfect · yet", "«Ещё не» — hasn't … yet."],
    ["B1", "Я подал заявление на убежище в прошлом году.", "I filed my asylum application last year.", "file an application", "«Подать заявление» — file an application; last year — Past Simple."],
    ["B2", "Я не помню точную дату, но это было весной.", "I don't remember the exact date, but it was in the spring.", "the exact · in the spring", "Конкретная дата — the exact date; время года — in the spring."],
    ["B2", "Если бы я остался, меня бы арестовали.", "If I had stayed, I would have been arrested.", "Third conditional · passive", "«Меня бы арестовали» — would have been arrested."],
  ]),
];

// every sentence the server may voice without sign-in (normalized like the site sends it)
export const builtinTexts = () => {
  const n = t => String(t).replace(/\s+/g, " ").trim();
  const set = new Set();
  for (const d of DIALOGS) { for (const [, t] of d.lines) set.add(n(t)); for (const [en] of d.vocab || []) set.add(n(en)); }
  for (const s of SENTENCES) set.add(n(s.en));
  return set;
};
