import type { RecipeViewModel } from '../../types/ketoBalanceContract';

interface RecipeArtworkProps {
  artworkKey: RecipeViewModel['artworkKey'];
  caption: string;
  size?: 'compact' | 'regular' | 'editorial';
  className?: string;
}

/**
 * Честные авторские локальные SVG-иллюстрации блюд для дизайн-прототипа «Кето Баланс».
 * В реестре docs/design/assets.md зафиксировано происхождение каждого файла/ключа.
 * Не выдаёт сгенерированную графику за реальную фотографию готового блюда.
 */
export function RecipeArtwork({
  artworkKey,
  caption,
  size = 'regular',
  className = '',
}: RecipeArtworkProps) {
  const heightClass =
    size === 'compact'
      ? 'h-28'
      : size === 'editorial'
      ? 'h-56 sm:h-64'
      : 'h-40 sm:h-44';

  return (
    <figure
      className={`relative overflow-hidden rounded-xl bg-[#EFE9DC] border border-[#E2DBD0] flex flex-col justify-between ${heightClass} ${className}`}
    >
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full object-cover"
        role="img"
        aria-label={caption}
      >
        {/* Тёплая текстура льняной салфетки и керамической тарелки */}
        <rect width="320" height="180" fill="#EFE9DC" />
        <path
          d="M0 145 Q160 130 320 150 L320 180 L0 180 Z"
          fill="#E5DEC9"
        />
        <ellipse cx="160" cy="92" rx="88" ry="68" fill="#FAF7F2" stroke="#DCD3C2" strokeWidth="2.5" />
        <ellipse cx="160" cy="92" rx="70" ry="52" fill="none" stroke="#EAE3D5" strokeWidth="1.2" />

        {artworkKey === 'eggs_avocado' && (
          <g>
            {/* Два яйца глазуньи */}
            <ellipse cx="136" cy="86" rx="34" ry="26" fill="#FFFFFF" stroke="#EDE6D8" strokeWidth="1.5" />
            <circle cx="134" cy="84" r="12" fill="#E08A2B" />
            <circle cx="152" cy="100" r="11" fill="#D97E22" />
            {/* Дольки спелого авокадо */}
            <path d="M174 62 C196 64, 208 88, 192 114 C178 106, 172 84, 174 62 Z" fill="#5F7161" />
            <path d="M176 66 C193 68, 202 88, 189 110 C178 102, 174 84, 176 66 Z" fill="#A5B884" />
            {/* Листики зелени */}
            <circle cx="122" cy="106" r="4" fill="#5F7161" />
            <circle cx="130" cy="112" r="3.5" fill="#4D5D4F" />
          </g>
        )}

        {artworkKey === 'cottage_scramble' && (
          <g>
            {/* Пышный творожный скрэмбл */}
            <ellipse cx="156" cy="92" rx="48" ry="34" fill="#F6D58E" />
            <circle cx="138" cy="84" r="14" fill="#FFFDF9" opacity="0.85" />
            <circle cx="170" cy="96" r="16" fill="#FFFDF9" opacity="0.85" />
            <circle cx="154" cy="78" r="10" fill="#F2C15A" />
            {/* Перья зелёного лука */}
            <circle cx="146" cy="88" r="3.5" fill="#5F7161" />
            <circle cx="162" cy="82" r="3.5" fill="#5F7161" />
            <circle cx="158" cy="98" r="3.5" fill="#4D5D4F" />
          </g>
        )}

        {artworkKey === 'baked_fish_herbs' && (
          <g>
            {/* Запечённое филе рыбы */}
            <rect
              x="102"
              y="68"
              width="78"
              height="40"
              rx="14"
              transform="rotate(-8 141 88)"
              fill="#E5987B"
            />
            <path
              d="M112 82 Q140 74 170 78 M114 94 Q142 86 172 90"
              stroke="#F4C7B5"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Соцветия цветной капусты и лимон */}
            <circle cx="196" cy="84" r="15" fill="#F3EFE4" stroke="#D8D0C1" strokeWidth="1.5" />
            <circle cx="188" cy="106" r="13" fill="#F3EFE4" stroke="#D8D0C1" strokeWidth="1.5" />
            <circle cx="134" cy="112" r="12" fill="#F3CF65" />
            <circle cx="134" cy="112" r="8" fill="#FAF0CA" />
          </g>
        )}

        {artworkKey === 'chicken_thighs_greens' && (
          <g>
            {/* Румяные куриные бёдра */}
            <ellipse cx="138" cy="92" rx="34" ry="25" fill="#C67B43" />
            <ellipse cx="138" cy="90" rx="26" ry="18" fill="#D88E54" />
            {/* Свежие огурцы и листья салата */}
            <circle cx="188" cy="78" r="16" fill="#7D9B76" />
            <circle cx="198" cy="98" r="14" fill="#5F7161" />
            <circle cx="176" cy="104" r="11" fill="#B5C99A" stroke="#5F7161" strokeWidth="2" />
          </g>
        )}

        {artworkKey === 'beef_patties_butter' && (
          <g>
            {/* Два рубленых говяжьих бифштекса с кусочком сливочного масла */}
            <ellipse cx="136" cy="88" rx="30" ry="23" fill="#6E4434" />
            <ellipse cx="168" cy="102" rx="28" ry="22" fill="#5C3729" />
            <rect x="130" y="80" width="14" height="12" rx="3" fill="#F5DC8C" />
            {/* Кружочки кабачка */}
            <circle cx="192" cy="74" r="12" fill="#8FA882" />
            <circle cx="192" cy="74" r="8" fill="#DCE5D1" />
          </g>
        )}

        {artworkKey === 'turkey_zucchini_skillet' && (
          <g>
            {/* Томлёная индейка с кабачком и укропом */}
            <rect x="114" y="70" width="32" height="24" rx="7" fill="#C98A5B" />
            <rect x="150" y="86" width="34" height="24" rx="7" fill="#BA7B4D" />
            <circle cx="136" cy="108" r="13" fill="#9BB08A" />
            <circle cx="176" cy="72" r="12" fill="#829973" />
            <circle cx="154" cy="78" r="3" fill="#4D5D4F" />
            <circle cx="144" cy="96" r="3" fill="#4D5D4F" />
          </g>
        )}

        {artworkKey === 'pork_roast_cabbage' && (
          <g>
            {/* Тушёная капуста со свининой */}
            <ellipse cx="160" cy="92" rx="54" ry="36" fill="#EBD6A7" />
            <rect x="128" y="76" width="26" height="20" rx="6" fill="#8C533E" />
            <rect x="164" y="88" width="26" height="20" rx="6" fill="#7A4633" />
            <path d="M120 104 Q155 92 192 106" stroke="#C9A96E" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}

        {artworkKey === 'carnivore_steak_eggs' && (
          <g>
            {/* Говяжий антрекот с желтками */}
            <path
              d="M104 88 C102 64, 148 56, 182 68 C202 76, 198 114, 168 120 C134 126, 106 112, 104 88 Z"
              fill="#6B3B2E"
            />
            <circle cx="186" cy="98" r="18" fill="#FFFFFF" />
            <circle cx="186" cy="98" r="9" fill="#E08A2B" />
          </g>
        )}
      </svg>

      <figcaption className="px-3 py-1.5 bg-[#FAF7F2]/95 text-[11px] leading-snug text-[#625C54] border-t border-[#E2DBD0] break-words">
        Иллюстрация макета · Фото блюда: [УТОЧНИТЬ]
      </figcaption>
    </figure>
  );
}
