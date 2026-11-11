'use strict';
/* Starter pages for the assistant's handbook. Teachers can edit, add and delete pages inside the app,
   so STARTER is only used once, when the database is created. Keep to things that are true; the assistant repeats them.
   SITE_GUIDE is different: it belongs to the code, always matches how the website works today, and is read by the assistant
   next to the teachers' pages (for signed-in users and for visitors). */

const STARTER = [
  {
    title: 'About the Smart Cities project',
    body: [
      'The Smart Cities project connects four schools in Cyprus: PASCAL Larnaka, PASCAL Lefkosia, PASCAL Limassol and the International School of Paphos.',
      'Teams of upper-school (IB) students, at least five per team, work with Seeed SenseCAP sensors that are fitted to school buses and cars. The sensors measure the air around the vehicle and report where the vehicle is.',
      'Students and visitors use the website to look at the live data, the maps and the history, and to compare the readings with the official weather stations. Teachers post announcements for the students.',
      'Teachers can add the project brief, deadlines and marking criteria as pages in this handbook, and the assistant will use them. The assistant also answers questions from visitors to the public website, so do not put private information in a page. A page whose title starts with "Staff", "Private" or "Internal" is never given to visitors.',
    ].join('\n'),
  },
  {
    title: 'What the sensors measure',
    body: [
      'The SenseCAP sensors report numbered measurements. The ones used here: 4097 air temperature in degrees Celsius, 4098 relative air humidity in %RH, 4099 light intensity in lux, 4100 carbon dioxide (CO2) in ppm, 4101 barometric pressure in pascal (100 Pa = 1 hPa, so 101300 Pa is 1013 hPa). Each vehicle also has GPS, but the website never shows exact positions.',
      'A vehicle may carry only some of these. The website shows only the measurements a sensor really has.',
      'A sensor on a moving vehicle measures the air around the vehicle, not the weather of the whole town. Sun on the roof, an open window, air conditioning, engine heat and passengers all change the numbers, especially temperature and CO2.',
    ].join('\n'),
  },
  {
    title: 'Reading CO2 values',
    body: [
      'Rules of thumb for CO2 in ppm: outdoor air is about 420 ppm today. Occupied rooms and vehicles often reach 800 to 1200. Above about 1000 ppm people often call the air stuffy, which means little fresh air is coming in. Above 2000 ppm ventilation is poor.',
      'CO2 inside a bus mostly comes from the people breathing, not from the engine. It rises with more passengers and closed windows and falls when doors or windows open. A good investigation compares a full bus and an empty bus, or windows open and closed.',
      'These are everyday guides, not health limits for a specific person.',
    ].join('\n'),
  },
  {
    title: 'Air quality: PM2.5 and PM10',
    body: [
      'PM2.5 and PM10 are tiny particles in the air, measured in micrograms per cubic metre (ug/m3). PM2.5 particles are smaller than 2.5 micrometres and go deeper into the lungs.',
      'The World Health Organization guideline levels (2021) are, for PM2.5, 15 ug/m3 as a 24-hour average and 5 ug/m3 as a yearly average, and for PM10, 45 ug/m3 for 24 hours and 15 ug/m3 per year.',
      'Cyprus often gets Saharan dust, which raises PM10 strongly and turns the sky yellow-brown.',
      'The vehicle sensors in this project may not measure particles. The app also shows particle values from the Open-Meteo air-quality model and from volunteer Sensor.Community sensors, which are less reliable.',
    ].join('\n'),
  },
  {
    title: 'Temperature, humidity and comfort',
    body: [
      'Comfortable indoor humidity is roughly 30 to 60 %RH. Warm air with high humidity feels hotter because sweat evaporates slowly.',
      'The Cyprus Department of Meteorology publishes a discomfort index for some stations. It combines temperature and humidity into a rating of how uncomfortable people feel.',
      'The temperature in a parked vehicle in sunshine can be much higher than the air temperature outside. Compare vehicle readings with a nearby official station before drawing conclusions.',
    ].join('\n'),
  },
  {
    title: 'Where the data comes from',
    body: [
      'SenseCAP: our own sensors on buses and cars. This is measured data. A sensor can be offline, have a flat battery or have no GPS fix.',
      'Cyprus Department of Meteorology (Met Office): about 54 automatic weather stations, updated about every 10 minutes. Weather Data Copyright The Cyprus Department of Meteorology. This server saves a reading from every station every 10 minutes, so history grows from the day saving began.',
      'Open-Meteo: a weather and air-quality computer model on a grid over Cyprus. This is a model estimate, not a measurement, so it can be off, especially near mountains and coasts.',
      'Sensor.Community: volunteers\' low-cost particle sensors. Useful for the idea, but individual sensors can be wrong.',
      'Airport weather reports (METAR) from Larnaca and Paphos airports.',
    ].join('\n'),
  },
  {
    title: 'Good practice with moving sensors',
    body: [
      'Say what you measured, where, when and how. Include units.',
      'Compare like with like: the same route at the same time on different days, or two vehicles at the same time. Check the nearest Met Office station for the weather on that day.',
      'Look at several readings, not one. A single spike may be a door opening, a sensor warming up or a GPS error.',
      'Say how sure you are. Mention what could have affected the sensor, and what you would do next to test your idea.',
      'Do not copy the assistant\'s text into your report. Use it to understand, then write in your own words and show your own data.',
    ].join('\n'),
  },
];


/* The first versions of two starter pages described a login-and-chat app that no longer exists. Databases that were created back then still
   hold them. They are never changed or deleted, but while a page is still word for word the old text, the assistant does not read it. */
const LEGACY = {
  'Using this app': [
      'Home shows your school\'s vehicles with their latest readings, plus the nearest Met Office weather station.',
      'Map shows every vehicle on a map, with the route it drove, a time-lapse of the day, wind and the weather stations. 3D shows the island with a column for each sensor.',
      'Met Office lists the official automatic weather stations of the Cyprus Department of Meteorology and their last readings.',
      'Chat has three kinds of channel: All schools, your school, and your team. There are no private messages between students. Anyone can report a message, and teachers can delete messages and mute people.',
      'Ask is the assistant. It can look up live readings and history, explain science ideas and help you plan how to analyse data. It is an AI, it can make mistakes, and your teachers can read what you ask it.',
      'To join, a student needs the school code from their teacher and then waits for a teacher to approve the account. If you forget your password, a teacher can reset it.',
    ].join('\n'),
  'Chat rules': [
      'Be kind and keep it about the project. No bullying, no rude or unkind comments about anyone.',
      'Never share private information: phone numbers, e-mail addresses, home addresses, social media handles or passwords. The app blocks links, e-mails and phone numbers in student messages.',
      'Use the report button on a message that worries you. Teachers read reports, can delete a message and can mute a member for a while.',
      'If something makes you feel unsafe, tell a teacher or another adult you trust today. The Cyprus child helpline is 116111 and the emergency number is 112.',
    ].join('\n'),
};

const SITE_GUIDE = [
  {
    title: 'How this website works',
    body: [
      'Anyone can open the website without signing in. It shows the Smart Cities sensor data (the dashboard), the map, a 3D view of Cyprus, the Met Office weather stations, announcements from the teachers and the Ask assistant.',
      'Vehicle positions are never live. Visitors see positions with a delay of at least two hours and rounded to about one kilometre (0.01 degree) so that nobody can follow a school bus or car. Only signed-in teachers see exact positions.',
      'Students do not need an account. In the Build studio a student enters the class code from the teacher and a team name, describes a tool, and Claude builds it. A teacher must approve a tool before anyone else can see it. Approved tools are public.',
      'Teachers sign in with their own account to see exact positions, approve tools, manage teams, read the questions that visitors asked the assistant and post announcements.',
      'Students cannot post messages. Teachers post announcements, and everyone can read them.',
      'Ask is an AI assistant. It reads the live data, the Met Office pages, the history and this handbook. It can make mistakes. Each visitor can ask a limited number of questions per day, and the whole site has a daily limit.',
    ].join('\n'),
  },
  {
    title: 'Privacy and safety on this website',
    body: [
      'Visitors do not give a name or an account. A random cookie counts how many questions a visitor asked, and questions and answers are saved without any name for 90 days so that teachers can check them. Answers can be reported.',
      'Never type personal details (full names, phone numbers, addresses, e-mails, social media or passwords) into the assistant.',
      'If a young person is being hurt, bullied or is unsafe, they should tell a teacher or another trusted adult today. The Cyprus child helpline is 116111 and the emergency number is 112.',
    ].join('\n'),
  },
];

module.exports = { STARTER, SITE_GUIDE, LEGACY };
