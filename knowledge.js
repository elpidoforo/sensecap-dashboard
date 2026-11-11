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

/* Sensor guides: one handbook page per kind of sensor the project uses, plus how to read a Met Office station. They are seeded into the
   handbook once (see school.js), so teachers can edit or delete them inside the app and their changes stay. The assistant reads them like
   every other handbook page, and visitors can read them on the Guides page. Plain English, short, and only things that are true. */
const GUIDE_PREFIX = 'Sensor guide: ';
const guide = (name, lines) => ({ title: GUIDE_PREFIX + name, body: lines.join('\n') });

const SENSOR_GUIDES = [
  guide('Air temperature', [
    'What it measures: how warm or cold the air is where the sensor sits, in degrees Celsius (SenseCAP measurement 4097).',
    'Normal range: outdoors in Cyprus it goes from a few degrees above zero on a winter night inland to above 40 degrees on the hottest summer afternoons. Inside a bus or car with the air conditioning on, 20 to 26 degrees is usual. A parked vehicle in the sun can pass 50 degrees.',
    'Common mistakes:',
    '- Comparing a vehicle sensor with a Met Office station without saying that the Met Office measures 1.2 m above the ground in the shade, while a vehicle sensor can sit in the sun, near the engine or in a warm cabin.',
    '- Reading it straight after the sensor moved from a cool place to a hot one. It needs several minutes to catch up.',
    '- Treating one reading as the temperature of the whole town. It is the air around that one sensor.',
    '- Forgetting that passengers, a closed window or the air conditioning change the number.',
  ]),
  guide('Air humidity', [
    'What it measures: relative humidity, in %RH (SenseCAP measurement 4098). It says how full of water vapour the air is compared with the most it could hold at that temperature.',
    'Normal range: 0 to 100 %RH. Inland afternoons in summer can be very dry (20 to 35 %RH), the coast in summer is often 50 to 75 %RH, and rain or fog is close to 100 %RH. Indoors, 30 to 60 %RH feels comfortable.',
    'Common mistakes:',
    '- Thinking humidity is the amount of water in the air. Warm air can hold more, so the %RH falls when the air warms up even if no water leaves it.',
    '- Putting the sensor in the sun, near a hot engine or near people breathing. Heat makes it read too dry and breath makes it read too wet.',
    '- Believing a value above 100 %RH. That is an error, or a sensor that got wet.',
    '- Comparing two sensors without checking that they are at the same temperature.',
  ]),
  guide('CO2', [
    'What it measures: carbon dioxide in the air, in parts per million (ppm) (SenseCAP measurement 4100).',
    'Normal range: fresh outdoor air is about 420 ppm today. A room or vehicle with people in it is often 600 to 1200 ppm. Above about 1000 ppm the air feels stuffy, and above 2000 ppm the ventilation is poor. These are everyday guides, not health limits for one person.',
    'Common mistakes:',
    '- Blaming the engine. Inside a bus most of the CO2 is the breath of the passengers, so it rises with a full bus and closed windows and falls when a door or window opens.',
    '- Breathing near the sensor. Breath holds about 40 000 ppm, so one breath on the sensor sends the number far above the real level of the room.',
    '- Not waiting. A CO2 sensor needs a minute or more to react, so compare values a few minutes after a window or door opens.',
    '- Trusting small gaps. A low-cost CO2 sensor can be 50 ppm or more off, so compare changes over time, or two situations with the same sensor, and not a 30 ppm gap between two sensors.',
  ]),
  guide('Light', [
    'What it measures: how bright the light is at the sensor, in lux (SenseCAP measurement 4099).',
    'Normal range: a moonlit night is below 1 lux, a lit room is 100 to 500 lux, a cloudy day outside is about 1000 to 10 000 lux, and direct sunshine is 30 000 to over 100 000 lux.',
    'Common mistakes:',
    '- Pointing the sensor at a wall or putting it under a seat or in a bag. It then reads the shade of its own spot, not the daylight.',
    '- Forgetting the windscreen and tinted glass. They cut the light, so a sensor behind glass reads lower than one outside.',
    '- Comparing lux with the solar radiation (W/m2) that the Met Office reports. Both follow the sun but they are different units. As a very rough guide, full sunshine is about 100 lux for each W/m2. It is not an exact conversion.',
    '- Reading a quick jump as a fault. The shadow of a tree or a building changes the value in seconds.',
  ]),
  guide('Barometric pressure', [
    'What it measures: the weight of the air above the sensor (SenseCAP measurement 4101). The sensor reports it in pascal (Pa). 100 Pa is 1 hPa, so 101300 Pa is 1013 hPa. The Met Office and weather maps use hPa.',
    'Normal range: at sea level the air pressure is about 1013 hPa on average and usually stays between 1000 and 1030 hPa. It is lower higher up, about 12 hPa less for every 100 m of height, so on the Troodos mountains it is near 800 hPa.',
    'Common mistakes:',
    '- Mixing up Pa and hPa. A value of 101300 is Pa, and the same air is 1013 hPa.',
    '- Comparing the pressure at your sensor with the "mean sea level" pressure of a weather station. A Met Office station gives the pressure at the station, the pressure converted to sea level (MSL) and QNH. Compare like with like.',
    '- Reading weather into a drive up a hill. The pressure drops as the bus climbs, which is height, not a storm.',
    '- Expecting big jumps. Weather changes the pressure slowly: a steady fall of several hPa over a few hours often comes before wind or rain. A sudden step in a vehicle is usually a door, a fan or the air conditioning.',
  ]),
  guide('PM2.5', [
    'What it measures: tiny particles in the air that are smaller than 2.5 micrometres (smoke, dust, exhaust), in micrograms per cubic metre (ug/m3). They are small enough to go deep into the lungs.',
    'Normal range: on an ordinary day in Cyprus about 5 to 20 ug/m3. The World Health Organization guideline (2021) is 15 ug/m3 as a 24-hour average and 5 ug/m3 as a yearly average. Dust from the Sahara and smoke from fires can push the numbers far higher for hours or days.',
    'Not every vehicle sensor in this project measures particles. The website also shows a computer model (an estimate, not a measurement) and volunteer Sensor.Community sensors, and says which is which.',
    'Common mistakes:',
    '- Reading it in very damp air. In fog or above about 85 %RH many low-cost sensors read too high, because droplets are counted as particles.',
    '- Comparing a 24-hour guideline with a one-minute reading. Use an average over a few hours.',
    '- Standing next to exhaust, a barbecue or smoke. You then measure that source, not the town.',
    '- Mixing up PM2.5 and PM10. PM10 also counts the bigger dust, so it is always at least as large as PM2.5.',
  ]),
  guide('Noise', [
    'What it measures: how loud the sound is, in decibels (dB), often with the A weighting (dBA) that follows how the human ear hears. Not every sensor in this project can measure noise. The website shows only what a sensor really has.',
    'Normal range: a quiet room is 30 to 40 dB, normal talking is about 60 dB, and a busy road is 70 to 85 dB. Many hours above 85 dB can damage hearing.',
    'Common mistakes:',
    '- Treating dB like an ordinary number. The scale is logarithmic: 10 dB more sounds about twice as loud, and 3 dB more is double the sound energy. Two identical buses side by side are about 3 dB louder than one, not twice the number.',
    '- Averaging dB values by hand. A proper average uses the sound energy, and a plain average of the numbers hides the loud moments. Look at the highest value as well as the average.',
    '- Putting the microphone near the engine, a fan or a speaker, or in a draught. Wind across a microphone makes a low rumble that is not traffic.',
    '- Comparing different times of day. Noise changes a lot between rush hour and night, so compare the same hour on different days.',
  ]),
  guide('Wind', [
    'What it measures: how fast the air moves and where it comes from. Speed is in metres per second (m/s) or in knots (kn): 1 kn is about 0.51 m/s, and 1 m/s is 3.6 km/h. Direction is the compass angle the wind comes FROM: 0 degrees is north, 90 east, 180 south and 270 west. Not every sensor in this project measures wind, but the Met Office stations do.',
    'Normal range: calm is under 1 m/s, a light breeze is 2 to 5 m/s, a strong breeze is about 11 to 14 m/s, and a gale starts near 17 m/s. Afternoon sea breezes on the Cyprus coast in summer are often 3 to 7 m/s.',
    'Common mistakes:',
    '- Mixing up from and towards. A west wind (270 degrees) blows from the west towards the east.',
    '- Using a sensor on a moving vehicle. It feels the speed of the vehicle: at 50 km/h (14 m/s) even still air reads 14 m/s. Use a fixed station for wind.',
    '- Comparing different heights. Met Office stations measure at 10 m above the ground (some also at 2 m). Wind is weaker lower down and near buildings and trees.',
    '- Mixing up the average wind and a gust. A gust is a short peak and is higher than the average.',
  ]),
  guide('Reading a Met Office station', [
    'What it is: the Cyprus Department of Meteorology (Met Office) runs about 54 automatic weather stations. Each one reports a new set of readings about every 10 minutes. This server saves them, so the history grows from the day saving began. Weather Data Copyright The Cyprus Department of Meteorology.',
    'What a reading holds: air temperature (1.2 m above the ground, in the shade), the highest and lowest temperature of the day, relative humidity, wind speed (in knots) and direction at 10 m, rain over 10 minutes and over 24 hours, radiation from the sun, and three kinds of air pressure: at the station, at mean sea level (MSL) and QNH (the sea-level pressure that pilots set on their altimeter). Not every station reports everything.',
    'Normal range: judge a station against its own past. A coastal station in summer is often 28 to 36 degrees by day, inland Nicosia can pass 40 degrees, and the Troodos mountains are much cooler (about 6.5 degrees less for every 1000 m of height).',
    'Common mistakes:',
    '- Reading the time wrongly. Check whether a time is Cyprus time or UTC. Cyprus is 2 hours ahead of UTC in winter and 3 hours ahead in summer.',
    '- Treating an empty cell as zero. It means the station did not report that reading. A rain value of 0.0 does mean dry.',
    '- Comparing pressure at the station with MSL pressure. Use MSL when you compare places at different heights.',
    '- Picking a station that is far away or at a very different height. Pick the nearest one at a similar height, and say which one you used and how old its reading was.',
    '- Mixing up knots and m/s for wind. 1 kn is about 0.51 m/s.',
    '- Assuming a station is always working. A station can go quiet for a while, so check the time of its last reading.',
  ]),
];

module.exports = { STARTER, SITE_GUIDE, LEGACY, SENSOR_GUIDES, GUIDE_PREFIX };
