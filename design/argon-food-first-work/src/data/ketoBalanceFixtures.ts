import type {
  GeneratedMenu,
  RecipeViewModel,
  ShoppingFixtureItem,
  UserSettingsDraft,
} from '../types/ketoBalanceContract';

export const INITIAL_SETTINGS_DRAFT: UserSettingsDraft = {
  confirmed18Plus: true,
  approach: 'keto',
  restrictions: [],
  prepTimeMax: 35,
  mealsPerDay: 3,
  preferenceNote: 'simple_daily',
  // Важно: напоминания только по явному opt-in, по умолчанию выключены
  remindersOptIn: false,
  currentStep: 1,
  isSaved: false,
};

export const DEMO_RECIPES: RecipeViewModel[] = [
  {
    id: 'kb-rec-eggs-avocado',
    title: 'Яичница-глазунья на топлёном масле с половинкой спелого авокадо и зеленью',
    subtitle: 'Спокойный сытный завтрак на одной сковороде за 10 минут',
    slotType: 'breakfast',
    slotLabel: 'Завтрак',
    prepMinutes: 10,
    suitableFor: ['keto'],
    avoids: ['no_dairy', 'no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'eggs_avocado',
    artworkCaption: 'Локальная иллюстрация блюда: глазунья с авокадо и микрозеленью на светлой керамике',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 тарелку (около 230 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Яйца куриные С0', amountLabel: '2 шт.', department: 'Яйца и молочное' },
          { name: 'Авокадо спелое', amountLabel: '1/2 шт.', department: 'Овощи и зелень' },
          { name: 'Масло топлёное (Гхи)', amountLabel: '1 ч. л.', department: 'Масла и бакалея' },
          { name: 'Петрушка или укроп свежий', amountLabel: 'небольшой пучок', department: 'Овощи и зелень' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 тарелки (около 460 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Яйца куриные С0', amountLabel: '4 шт.', department: 'Яйца и молочное' },
          { name: 'Авокадо спелое', amountLabel: '1 целое шт.', department: 'Овощи и зелень' },
          { name: 'Масло топлёное (Гхи)', amountLabel: '2 ч. л.', department: 'Масла и бакалея' },
          { name: 'Петрушка или укроп свежий', amountLabel: 'средний пучок', department: 'Овощи и зелень' },
        ],
      },
    },
    steps: [
      'Разогрей сковороду на среднем огне и растопи топлёное масло.',
      'Аккуратно разбей яйца, посоли по вкусу и готовь 3–4 минуты, чтобы белок схватился, а желток остался мягким.',
      'Нарежь половинку авокадо ломтиками, выложи рядом с глазуньей и посыпь свежей зеленью.',
    ],
    substitutions: [
      'Топлёное масло можно заменить сливочным маслом 82,5% (если переносишь молочное) или оливковым маслом.',
      'Вместо авокадо подойдут свежие огурцы со столовой ложкой оливкового масла.',
    ],
    storageRule: 'Готовить непосредственно перед подачей; нарезанное авокадо хранить в холодильнике не более 12 часов, сбрызнув соком лимона.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-cottage-scramble',
    title: 'Нежный творожный скрэмбл со сливочным маслом и зелёным луком',
    subtitle: 'Мягкий белково-жировой завтрак для тех, кто любит молочные продукты',
    slotType: 'breakfast',
    slotLabel: 'Завтрак',
    prepMinutes: 12,
    suitableFor: ['keto', 'carnivore'],
    avoids: ['no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'cottage_scramble',
    artworkCaption: 'Локальная иллюстрация блюда: пышный скрэмбл с фермерским творогом в тёплой миске',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 220 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Яйца куриные С0', amountLabel: '2 шт.', department: 'Яйца и молочное' },
          { name: 'Творог фермерский 9%', amountLabel: '80 г', department: 'Яйца и молочное' },
          { name: 'Масло сливочное 82,5%', amountLabel: '15 г', department: 'Яйца и молочное' },
          { name: 'Лук зелёный (по желанию)', amountLabel: '2 пера', department: 'Овощи и зелень' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 440 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Яйца куриные С0', amountLabel: '4 шт.', department: 'Яйца и молочное' },
          { name: 'Творог фермерский 9%', amountLabel: '160 г', department: 'Яйца и молочное' },
          { name: 'Масло сливочное 82,5%', amountLabel: '30 г', department: 'Яйца и молочное' },
          { name: 'Лук зелёный (по желанию)', amountLabel: '4 пера', department: 'Овощи и зелень' },
        ],
      },
    },
    steps: [
      'Растопи сливочное масло на тихом огне.',
      'Взбей яйца вилкой, вылей на сковороду и сразу добавь творог.',
      'Постоянно помешивай лопаткой 3 минуты до мягкой кремовой текстуры и посыпь зелёным луком.',
    ],
    substitutions: [
      'Для строгого карнивор-варианта просто исключи зелёный лук.',
      'Вместо творога можно добавить 30 г тёртого твёрдого сыра.',
    ],
    storageRule: 'Лучше съесть сразу тёплым; в закрытом контейнере в холодильнике хранится до утра следующего дня.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-baked-fish-herbs',
    title: 'Запечённое филе белой или красной рыбы с лимоном и цветной капустой',
    subtitle: 'Лёгкий обед в духовке без лишней посуды и чада на кухне',
    slotType: 'lunch',
    slotLabel: 'Обед',
    prepMinutes: 25,
    suitableFor: ['keto'],
    avoids: ['no_dairy', 'no_eggs', 'no_nuts', 'no_pork'],
    artworkKey: 'baked_fish_herbs',
    artworkCaption: 'Локальная иллюстрация блюда: запечённое рыбное филе с соцветиями цветной капусты',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 310 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе трески, скумбрии или горбуши', amountLabel: '180 г', department: 'Мясо, птица и рыба' },
          { name: 'Капуста цветная (свежая или замороженная)', amountLabel: '150 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое первого отжима', amountLabel: '1,5 ст. л.', department: 'Масла и бакалея' },
          { name: 'Лимон свежий', amountLabel: '2 кружочка', department: 'Овощи и зелень' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 620 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе трески, скумбрии или горбуши', amountLabel: '360 г', department: 'Мясо, птица и рыба' },
          { name: 'Капуста цветная (свежая или замороженная)', amountLabel: '300 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое первого отжима', amountLabel: '3 ст. л.', department: 'Масла и бакалея' },
          { name: 'Лимон свежий', amountLabel: '4 кружочка', department: 'Овощи и зелень' },
        ],
      },
    },
    steps: [
      'Разогрей духовку до 190 °C. Выложи в форму филе рыбы и разобранную на соцветия цветную капусту.',
      'Щедро полей оливковым маслом, посоли и положи сверху кружочки лимона.',
      'Запекай 20 минут до мягкости капусты и сочности рыбы.',
    ],
    substitutions: [
      'Подойдёт любая доступная рыба: скумбрия, минтай, горбуша или форель.',
      'Цветную капусту можно заменить кабачком или брокколи.',
    ],
    storageRule: 'Хранится в стеклянном контейнере в холодильнике до 36 часов; удобно взять с собой на работу.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-chicken-thighs-greens',
    title: 'Румяные куриные бёдра на сковороде с салатом из свежих огурцов и редиса',
    subtitle: 'Понятный домашний обед из продуктов любого магазина у дома',
    slotType: 'lunch',
    slotLabel: 'Обед',
    prepMinutes: 25,
    suitableFor: ['keto'],
    avoids: ['no_dairy', 'no_eggs', 'no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'chicken_thighs_greens',
    artworkCaption: 'Локальная иллюстрация блюда: запечённые куриные бёдра со свежим зелёным салатом',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 300 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе куриного бедра с кожей', amountLabel: '200 г', department: 'Мясо, птица и рыба' },
          { name: 'Огурцы свежие', amountLabel: '1 средний шт.', department: 'Овощи и зелень' },
          { name: 'Листья салата или пекинская капуста', amountLabel: '70 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое', amountLabel: '1 ст. л.', department: 'Масла и бакалея' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 600 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе куриного бедра с кожей', amountLabel: '400 г', department: 'Мясо, птица и рыба' },
          { name: 'Огурцы свежие', amountLabel: '2 средних шт.', department: 'Овощи и зелень' },
          { name: 'Листья салата или пекинская капуста', amountLabel: '140 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое', amountLabel: '2 ст. л.', department: 'Масла и бакалея' },
        ],
      },
    },
    steps: [
      'Промокни куриные бёдра салфеткой, посоли и выложи на разогретую сковороду кожей вниз.',
      'Жарь на среднем огне 10 минут до золотистой корочки, затем переверни и готовь ещё 8–9 минут.',
      'Нарежь свежий огурец и листья салата, заправь оливковым маслом и подавай к горячей птице.',
    ],
    substitutions: [
      'Куриные бёдра можно заменить на голени или бедро индейки.',
      'Вместо оливкового масла салат вкусно заправить сметаной 20% (если ешь молочное).',
    ],
    storageRule: 'Готовые куриные бёдра хранятся в холодильнике до 2 суток; салат нарезай непосредственно перед едой.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-beef-patties-butter',
    title: 'Домашние рубленые бифштексы из говядины с томлёным кабачком и маслом',
    subtitle: 'Сытный спокойный ужин, который можно приготовить сразу на два вечера',
    slotType: 'dinner',
    slotLabel: 'Ужин',
    prepMinutes: 20,
    suitableFor: ['keto', 'carnivore'],
    avoids: ['no_eggs', 'no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'beef_patties_butter',
    artworkCaption: 'Локальная иллюстрация блюда: сочные говяжьи бифштексы с кусочком масла и кабачком',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (2 бифштекса с гарниром)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Фарш говяжий (из лопатки или грудинки)', amountLabel: '200 г', department: 'Мясо, птица и рыба' },
          { name: 'Кабачок молодой (для кето-варианта)', amountLabel: '120 г', department: 'Овощи и зелень' },
          { name: 'Масло топлёное или сливочное', amountLabel: '20 г', department: 'Масла и бакалея' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (4 бифштекса, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Фарш говяжий (из лопатки или грудинки)', amountLabel: '400 г', department: 'Мясо, птица и рыба' },
          { name: 'Кабачок молодой (для кето-варианта)', amountLabel: '240 г', department: 'Овощи и зелень' },
          { name: 'Масло топлёное или сливочное', amountLabel: '40 г', department: 'Масла и бакалея' },
        ],
      },
    },
    steps: [
      'Сформируй из говяжьего фарша плоские круглые бифштексы, посоли только снаружи.',
      'Обжарь на топлёном масле по 4–5 минут с каждой стороны.',
      'В оставшемся соке прогрей кружочки кабачка по 2 минуты с каждой стороны (в режиме карнивор кабачок пропусти).',
    ],
    substitutions: [
      'Если не ешь молочное, используй только топлёное масло Гхи или говяжий жир.',
      'Кабачок можно заменить стручковой фасолью или полностью убрать для карнивор-рациона.',
    ],
    storageRule: 'Бифштексы отлично хранятся в холодильнике до 2 дней и подходят для заморозки впрок.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-turkey-zucchini-skillet',
    title: 'Томлёное филе бедра индейки с кабачком и свежим укропом в сотейнике',
    subtitle: 'Деликатное блюдо без молочных продуктов, яиц, рыбы, орехов и свинины',
    slotType: 'dinner',
    slotLabel: 'Ужин',
    prepMinutes: 20,
    suitableFor: ['keto'],
    avoids: ['no_dairy', 'no_eggs', 'no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'turkey_zucchini_skillet',
    artworkCaption: 'Локальная иллюстрация блюда: сотейник с кусочками индейки, кабачком и зеленью',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 290 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе бедра индейки', amountLabel: '190 г', department: 'Мясо, птица и рыба' },
          { name: 'Кабачок свежий', amountLabel: '130 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое или топлёное', amountLabel: '1,5 ст. л.', department: 'Масла и бакалея' },
          { name: 'Укроп свежий', amountLabel: 'по вкусу', department: 'Овощи и зелень' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 580 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Филе бедра индейки', amountLabel: '380 г', department: 'Мясо, птица и рыба' },
          { name: 'Кабачок свежий', amountLabel: '260 г', department: 'Овощи и зелень' },
          { name: 'Масло оливковое или топлёное', amountLabel: '3 ст. л.', department: 'Масла и бакалея' },
          { name: 'Укроп свежий', amountLabel: 'пучок', department: 'Овощи и зелень' },
        ],
      },
    },
    steps: [
      'Нарежь бедро индейки небольшими кусочками и обжарь в сотейнике с маслом 10 минут.',
      'Добавь нарезанный кубиками кабачок, посоли и потоми под крышкой ещё 7–8 минут.',
      'Перед подачей посыпь мелко рубленным свежим укропом.',
    ],
    substitutions: [
      'Бедро индейки можно заменить на филе куриного бедра или нежирную говядину.',
    ],
    storageRule: 'В закрытом контейнере в холодильнике хранится до 48 часов.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-pork-roast-cabbage',
    title: 'Тушёная свиная шейка с молодой белокочанной капустой и тмином',
    subtitle: 'Уютное домашнее блюдо на обед или ужин из привычных продуктов',
    slotType: 'dinner',
    slotLabel: 'Ужин',
    prepMinutes: 35,
    suitableFor: ['keto'],
    avoids: ['no_dairy', 'no_eggs', 'no_fish', 'no_nuts'],
    artworkKey: 'pork_roast_cabbage',
    artworkCaption: 'Локальная иллюстрация блюда: румяная свинина с тушёной капустой в глубокой тарелке',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 320 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Свиная шейка охлаждённая', amountLabel: '180 г', department: 'Мясо, птица и рыба' },
          { name: 'Капуста белокочанная свежая', amountLabel: '160 г', department: 'Овощи и зелень' },
          { name: 'Масло топлёное', amountLabel: '1 ч. л.', department: 'Масла и бакалея' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 640 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Свиная шейка охлаждённая', amountLabel: '360 г', department: 'Мясо, птица и рыба' },
          { name: 'Капуста белокочанная свежая', amountLabel: '320 г', department: 'Овощи и зелень' },
          { name: 'Масло топлёное', amountLabel: '2 ч. л.', department: 'Масла и бакалея' },
        ],
      },
    },
    steps: [
      'Нарежь свиную шейку кубиками и подрумянь в глубокой сковороде 10 минут.',
      'Добавь тонко нашинкованную капусту, щепотку соли и немного воды на дно.',
      'Туши под крышкой на медленном огне 20 минут до мягкости капусты.',
    ],
    substitutions: [
      'Если не ешь свинину, выбери говяжью лопатку или бедро индейки.',
    ],
    storageRule: 'Хранится в холодильнике до 2 суток, на следующий день становится ещё вкуснее.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
  {
    id: 'kb-rec-carnivore-steak-eggs',
    title: 'Говяжий антрекот на чугунной сковороде с двумя желтками (Карнивор)',
    subtitle: 'Лаконичное блюдо исключительно из животных продуктов без растительной клетчатки',
    slotType: 'lunch',
    slotLabel: 'Обед',
    prepMinutes: 18,
    suitableFor: ['keto', 'carnivore'],
    avoids: ['no_dairy', 'no_fish', 'no_nuts', 'no_pork'],
    artworkKey: 'carnivore_steak_eggs',
    artworkCaption: 'Локальная иллюстрация блюда: говяжий антрекот с глазуньей на тёмной чугунной поверхности',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: 'На 1 порцию (около 280 г)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Говяжий антрекот или тонкий край', amountLabel: '220 г', department: 'Мясо, птица и рыба' },
          { name: 'Яйца куриные С0', amountLabel: '2 шт.', department: 'Яйца и молочное' },
          { name: 'Жир говяжий или топлёное масло Гхи', amountLabel: '1 ст. л.', department: 'Масла и бакалея' },
        ],
      },
      2: {
        portions: 2,
        yieldNote: 'На 2 порции (около 560 г, предзаданный демо-вариант)',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Говяжий антрекот или тонкий край', amountLabel: '440 г', department: 'Мясо, птица и рыба' },
          { name: 'Яйца куриные С0', amountLabel: '4 шт.', department: 'Яйца и молочное' },
          { name: 'Жир говяжий или топлёное масло Гхи', amountLabel: '2 ст. л.', department: 'Масла и бакалея' },
        ],
      },
    },
    steps: [
      'Обжарь говяжий антрекот на хорошо прогретой сковороде по 3–4 минуты с каждой стороны и переложи на тёплую тарелку.',
      'На той же сковороде поджарь яйца 2–3 минуты, сохраняя жидкий желток как соус к мясу.',
    ],
    substitutions: [
      'Если исключены яйца, подай антрекот с кусочком топлёного масла Гхи.',
    ],
    storageRule: 'Готовить непосредственно перед подачей.',
    sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)',
  },
];

export const DEMO_RECIPES_BY_ID: Record<string, RecipeViewModel> =
  Object.fromEntries(DEMO_RECIPES.map((r) => [r.id, r]));

/**
 * Готовый согласованный демо-экземпляр меню по контракту основного проекта:
 * - created: число (Unix timestamp)
 * - days[i].slots: Record<string, string> (идентификаторы рецептов)
 */
export const DEMO_GENERATED_MENU: GeneratedMenu = {
  id: 'menu-demo-starter-3d',
  created: 1793145600000,
  title: 'Стартовое меню на 3 дня',
  days: [
    {
      dayIndex: 1,
      label: 'День 1 · Спокойный старт',
      slots: {
        breakfast: 'kb-rec-eggs-avocado',
        lunch: 'kb-rec-baked-fish-herbs',
        dinner: 'kb-rec-beef-patties-butter',
      },
    },
    {
      dayIndex: 2,
      label: 'День 2 · Простые домашние блюда',
      slots: {
        breakfast: 'kb-rec-cottage-scramble',
        lunch: 'kb-rec-chicken-thighs-greens',
        dinner: 'kb-rec-turkey-zucchini-skillet',
      },
    },
    {
      dayIndex: 3,
      label: 'День 3 · Готовка без спешки',
      slots: {
        breakfast: 'kb-rec-eggs-avocado',
        lunch: 'kb-rec-carnivore-steak-eggs',
        dinner: 'kb-rec-pork-roast-cabbage',
      },
    },
  ],
};

/**
 * Предварительно сверенный демонстрационный список покупок, связанный с Днём 1–2 стартового меню.
 * Не использует самописную агрегацию строк; при замене блюда в меню помечается как требующий обновления.
 */
export const DEMO_SHOPPING_FIXTURE: ShoppingFixtureItem[] = [
  {
    id: 'shop-fix-1',
    name: 'Фарш говяжий (из лопатки или грудинки)',
    amountLabel: '400 г',
    department: 'Мясо, птица и рыба',
    alreadyHave: false,
    checkedInStore: false,
    linkedRecipeTitles: ['Домашние рубленые бифштексы из говядины с томлёным кабачком и маслом'],
  },
  {
    id: 'shop-fix-2',
    name: 'Филе трески, скумбрии или горбуши',
    amountLabel: '360 г',
    department: 'Мясо, птица и рыба',
    alreadyHave: false,
    checkedInStore: false,
    linkedRecipeTitles: ['Запечённое филе белой или красной рыбы с лимоном и цветной капустой'],
  },
  {
    id: 'shop-fix-3',
    name: 'Филе куриного бедра с кожей',
    amountLabel: '400 г',
    department: 'Мясо, птица и рыба',
    alreadyHave: false,
    checkedInStore: false,
    linkedRecipeTitles: ['Румяные куриные бёдра на сковороде с салатом из свежих огурцов и редиса'],
  },
  {
    id: 'shop-fix-4',
    name: 'Яйца куриные отборные С0',
    amountLabel: '1 десяток (10 шт.)',
    department: 'Яйца и молочное',
    alreadyHave: true,
    checkedInStore: false,
    linkedRecipeTitles: [
      'Яичница-глазунья на топлёном масле с половинкой спелого авокадо и зеленью',
      'Нежный творожный скрэмбл со сливочным маслом и зелёным луком',
    ],
  },
  {
    id: 'shop-fix-5',
    name: 'Авокадо спелое',
    amountLabel: '2 шт.',
    department: 'Овощи и зелень',
    alreadyHave: false,
    checkedInStore: false,
    linkedRecipeTitles: ['Яичница-глазунья на топлёном масле с половинкой спелого авокадо и зеленью'],
  },
  {
    id: 'shop-fix-6',
    name: 'Капуста цветная и молодые кабачки',
    amountLabel: '300 г капусты + 2 кабачка',
    department: 'Овощи и зелень',
    alreadyHave: false,
    checkedInStore: false,
    linkedRecipeTitles: [
      'Запечённое филе белой или красной рыбы с лимоном и цветной капустой',
      'Домашние рубленые бифштексы из говядины с томлёным кабачком и маслом',
    ],
  },
  {
    id: 'shop-fix-7',
    name: 'Масло топлёное (Гхи) и оливковое масло',
    amountLabel: '1 банка (250 г) + 1 бутылка',
    department: 'Масла и бакалея',
    alreadyHave: true,
    checkedInStore: false,
    linkedRecipeTitles: ['Базовые жиры для жарки и заправки салатов'],
  },
];

export interface ReferenceMaterialItem {
  id: string;
  title: string;
  summary: string;
  contentPoints: string[];
  sourceLabel: string;
  verificationStatus: 'Согласовано в продуктовом брифе' | '[УТОЧНИТЬ у автора марафона]';
}

export const DEMO_MATERIALS: ReferenceMaterialItem[] = [
  {
    id: 'mat-pantry-swaps',
    title: 'Спокойные замены на кухне: если нет нужного продукта',
    summary: 'Чем заменить рыбу, авокадо или молочные продукты без лишней поездки в магазин.',
    contentPoints: [
      'Нет авокадо: возьми обычный свежий огурец или зелёный салат и заправь ложкой хорошего оливкового или сливочного масла.',
      'Нет красной рыбы: подойдёт любая доступная морская рыба — скумбрия, треска, минтай или сельдь слабого посола без сахара в маринаде.',
      'Исключаешь молочные продукты: готовь на топлёном масле Гхи, кокосовом масле или животном жире.',
    ],
    sourceLabel: 'Материалы вводного гида «Кето Баланс» (прототип)',
    verificationStatus: 'Согласовано в продуктовом брифе',
  },
  {
    id: 'mat-labels',
    title: 'Как читать этикетки в обычном магазине',
    summary: 'На что обратить внимание при выборе бекона, сметаны, рыбы и консервов.',
    contentPoints: [
      'Смотри на состав, а не на надписи «фитнес» или «био» на лицевой стороне упаковки.',
      'В мясных деликатесах и солёной рыбе лучше выбирать варианты, где в составе только мясо/рыба, соль и специи.',
      'Точный перечень допустимых брендов для участников марафона формируется Ольгой.',
    ],
    sourceLabel: 'Памятка для участников старта [УТОЧНИТЬ финальную редакцию у Ольги]',
    verificationStatus: '[УТОЧНИТЬ у автора марафона]',
  },
  {
    id: 'mat-prep-storage',
    title: 'Заготовки на 2 дня, чтобы не стоять у плиты каждый вечер',
    summary: 'Простые правила хранения готового мяса, птицы и нарезанной зелени.',
    contentPoints: [
      'Запечённые куриные бёдра и говяжьи бифштексы можно приготовить сразу на 2 приёма пищи и хранить в стеклянном контейнере в холодильнике до 48 часов.',
      'Листовую зелень и огурцы лучше нарезать непосредственно перед подачей, чтобы они сохранили свежесть.',
    ],
    sourceLabel: 'Кулинарная памятка «Кето Баланс»',
    verificationStatus: 'Согласовано в продуктовом брифе',
  },
];
