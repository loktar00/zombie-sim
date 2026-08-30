# 火柴三國 unit reference

The battle simulator fields 1,000 soldiers per side. One canvas figure is one soldier or
one equipment piece. Statistics below come from the tuning tables in
[`js/scenarios/sanguo.js`](../js/scenarios/sanguo.js); silhouettes come from
[`js/figure/figure.js`](../js/figure/figure.js).

Distances are world pixels, speeds are pixels per second, and cooldowns are seconds between
attacks. Fatigue and wavering morale can reduce actual movement speed.

| Unit | Role | HP | March / charge / flee | Reach or range | Cooldown | Damage | Characteristics |
|---|---|---:|---:|---:|---:|---:|---|
| Spearmen (槍兵) | Defensive line infantry | 5 | 64 / 96 / 116 | 21 melee | 0.80 | 1 | Balanced frontage; deals 2× damage to cavalry and horse archers. |
| Sword and shield (刀盾兵) | Fast close infantry | 6 | 70 / 104 / 120 | 17 melee | 0.62 | 1 | Shortest reach, but attacks fastest among foot troops and has solid health. |
| Crossbowmen (弩兵) | Long-range missile infantry | 3 | 72 / 72 / 124 | 230 range; retreats inside 60 | 2.10 | 1 | Fragile ranged block; gives ground when enemies enter its minimum range. |
| Halberdiers (戟兵) | Anti-cavalry heavy infantry | 5 | 60 / 92 / 112 | 24 melee | 0.90 | 1 | Longest ordinary infantry reach; deals 2.2× damage to cavalry and horse archers. |
| Cavalry (騎兵) | Shock and pursuit | 7 | 132 / 180 / 152 | 20 melee | 0.50 | 2 | Fast, durable, highest routine melee damage; a charge hit knocks its target forward. |
| Horse archers (弓騎兵) | Mobile ranged harassment | 4 | 140 / 150 / 156 | 170 range; retreats inside 55 | 1.80 | 1 | Fastest march and flee speed; shoots while not charging and becomes shock cavalry on charge. |
| Catapult (投石車) | Heavy long-range support | 12 | 34 / 34 / 58 | 360 range; retreats inside 120 | 4.20 | 3 | Longest range and a heavy hit, offset by the slowest movement and fire rate. |
| Battering ram (衝車) | Durable close assault equipment | 16 | 42 / 58 / 64 | 27 melee | 1.15 | 3 | Highest health, melee reach, and impact damage; currently fights units in open-field battles and has no separate gate-damage rule. |
| Standard bearer (旗手) | Formation identity and morale read | 8 | 62 / 86 / 108 | 18 melee | 0.85 | 1 | Carries 劉 for the player or 曹 for the computer. Every formation block has one bearer; the flag falls permanently when that bearer routs or dies. |

## Default army composition

Each side starts with this 1,000-strong composition:

| Unit | Share | Figures |
|---|---:|---:|
| Spearmen | 27% | 270 |
| Sword and shield | 17% | 170 |
| Crossbowmen | 15% | 150 |
| Halberdiers | 15% | 150 |
| Cavalry | 10% | 100 |
| Horse archers | 8% | 80 |
| Catapults | 3% | 30 |
| Battering rams | 3% | 30 |
| Standard-bearer troop allocation | 2% | 20 |

The composition is divided into 11 formation blocks per side: spearmen and cavalry split
between two wings, while each other type forms one block. The first figure in every block is
rendered and simulated with standard-bearer statistics, replacing one member rather than
increasing the 1,000-soldier total. Generals are assigned to a different member.

## Shared battle behavior

- Every unit has block morale, fatigue, formation cohesion, routing, and possible rallying
  near a living general.
- Line, column, wedge, square, and skirmish formations rearrange the same surviving figures.
- Routed soldiers flee toward a world edge. Pursuers inflict one additional damage when
  striking a fleeing target.
- The simulation is deterministic from its seed, army setup, and order log. Visual chatter,
  sound, boiling lines, and flag motion do not consume combat randomness.

