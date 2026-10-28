// Lezioni di allenamento: combattimenti preparati con carte reali. Tu attacchi e assegni i danni,
// il PC difende; il motore in src/lib/combat.ts applica le regole citate.
// Le carte usate hanno solo Might e parole chiave gestite dal motore (Assault, Shield, Tank).

export interface TrainingUnit {
  card: string
  stunned?: boolean
  damage?: number
}

export interface TrainingLesson {
  id: string
  title: string
  goal: string
  hint: string
  rules: string[]
  attackers: TrainingUnit[]
  defenders: TrainingUnit[]
  points: number
  /** Altri campi su cui hai già segnato in questo turno. */
  scoredOthers: number
}

export const TRAINING_POOL = [
  'Playful Phantom',
  'Stalwart Poro',
  'Sunlit Guardian',
  'Mega-Mech',
  'Mountain Drake',
  'Shipyard Skulker',
  'Daring Poro',
  'Petty Officer',
  'Vanguard Sergeant',
  'Zephyr Sage',
  'Laurent Duelist',
  'Mutated Mouser',
  'Towering Combatant',
  'Horns of the Dragon',
]

export const LESSONS: TrainingLesson[] = [
  {
    id: 'primo-combattimento',
    title: 'Il primo combattimento',
    goal: 'Assegna i danni e conquista il campo.',
    hint: 'Sommi la Might delle tue unità: è il totale dei danni da assegnare. Petty Officer ha Assault, quindi in attacco vale 1 in più.',
    rules: ['467.2', '807.1.c'],
    attackers: [{ card: 'Petty Officer' }],
    defenders: [{ card: 'Shipyard Skulker' }],
    points: 2,
    scoredOthers: 0,
  },
  {
    id: 'letali-per-intero',
    title: 'Danni letali per intero',
    goal: 'Elimina entrambi i difensori.',
    hint: 'Devi dare danni letali a un’unità prima di passare alla successiva. Stalwart Poro ha Shield: in difesa vale 3.',
    rules: ['467.2.c.3', '814.1.c'],
    attackers: [{ card: 'Vanguard Sergeant' }, { card: 'Daring Poro' }],
    defenders: [{ card: 'Stalwart Poro' }, { card: 'Shipyard Skulker' }],
    points: 3,
    scoredOthers: 0,
  },
  {
    id: 'tank',
    title: 'Prima il Tank',
    goal: 'Supera la difesa di Horns of the Dragon.',
    hint: 'Horns of the Dragon ha Tank: deve ricevere danni letali prima di qualsiasi altra unità senza Tank.',
    rules: ['815.1.b', '815.1.c.2'],
    attackers: [{ card: 'Mountain Drake' }],
    defenders: [{ card: 'Horns of the Dragon' }, { card: 'Daring Poro' }],
    points: 4,
    scoredOthers: 0,
  },
  {
    id: 'stordita',
    title: 'Un difensore stordito',
    goal: 'Zephyr Sage è stato stordito prima del combattimento. Eliminalo.',
    hint: 'Un’unità stordita non infligge danni, ma per ucciderla servono danni pari alla sua Might piena, Shield compreso.',
    rules: ['424.1.b', '424.1.c'],
    attackers: [{ card: 'Vanguard Sergeant' }, { card: 'Laurent Duelist' }],
    defenders: [{ card: 'Zephyr Sage', stunned: true }],
    points: 1,
    scoredOthers: 0,
  },
  {
    id: 'danni-segnati',
    title: 'Danni già segnati',
    goal: 'Mega-Mech ha già 5 danni da prima: approfittane.',
    hint: 'I danni restano segnati fino al cleanup: a Mega-Mech ne bastano 3. Ma prima viene il Tank, e non puoi dare a un’unità più del necessario finché le altre non hanno danni letali.',
    rules: ['143.3', '467.2.c.4', '815.1.b'],
    attackers: [{ card: 'Mountain Drake' }, { card: 'Daring Poro' }],
    defenders: [{ card: 'Sunlit Guardian' }, { card: 'Mega-Mech', damage: 5 }],
    points: 5,
    scoredOthers: 0,
  },
  {
    id: 'stallo',
    title: 'Quando nessuno vince',
    goal: 'Il difensore è stordito, ma ha Shield 2. Cosa succede?',
    hint: 'Se dopo i danni restano unità di entrambi i lati, gli attaccanti tornano alla base e il campo resta al difensore.',
    rules: ['468.1.a.2', '814.1.c'],
    attackers: [{ card: 'Daring Poro' }],
    defenders: [{ card: 'Towering Combatant', stunned: true }],
    points: 3,
    scoredOthers: 0,
  },
  {
    id: 'ultimo-punto',
    title: 'L’ultimo punto',
    goal: 'Hai 7 punti. Conquista questo campo.',
    hint: 'In questo turno non hai segnato sull’altro campo: il punto finale non arriva da una conquista se non hai segnato su tutti i campi.',
    rules: ['473.1.b.1'],
    attackers: [{ card: 'Laurent Duelist' }],
    defenders: [{ card: 'Shipyard Skulker' }],
    points: 7,
    scoredOthers: 0,
  },
  {
    id: 'vittoria',
    title: 'Il punto della vittoria',
    goal: 'Hai 7 punti e all’inizio del turno hai tenuto l’altro campo. Chiudi la partita.',
    hint: 'Hai già segnato sull’altro campo in questo turno: conquistando questo hai segnato su tutti i campi e guadagni il punto finale.',
    rules: ['473.1.b.1', '474'],
    attackers: [{ card: 'Petty Officer' }, { card: 'Stalwart Poro' }],
    defenders: [{ card: 'Mutated Mouser' }, { card: 'Vanguard Sergeant' }],
    points: 7,
    scoredOthers: 1,
  },
]
