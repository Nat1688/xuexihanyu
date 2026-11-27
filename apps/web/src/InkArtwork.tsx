/** Decorative, local SVG artwork: no content, tracking, network or interaction. */
export function InkArtwork({
  kind = 'circle',
  className = '',
}: {
  kind?: 'circle' | 'landscape';
  className?: string;
}) {
  return (
    <svg
      className={`ink-artwork ${className}`}
      viewBox={kind === 'circle' ? '0 0 240 240' : '0 0 360 180'}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {kind === 'circle' ? (
        <>
          <path
            d="M191 54C157 16 83 22 46 64C6 110 24 180 74 205C119 227 174 214 200 169C221 131 210 88 185 66"
            stroke="currentColor"
            strokeWidth="17"
            opacity=".2"
          />
          <path
            d="M184 44C143 21 90 29 58 66C26 104 29 157 61 190C93 222 146 222 181 193"
            stroke="currentColor"
            strokeWidth="6"
            opacity=".24"
            strokeDasharray="132 5 42 4 94 8 180"
          />
          <path
            d="M203 90C219 133 202 178 168 199M45 175C22 140 28 96 51 68M74 43C104 25 139 24 165 33"
            stroke="currentColor"
            strokeWidth="3"
            opacity=".38"
          />
          <path
            d="M58 188L73 198M78 205L86 208M199 72L204 83M34 108L32 120M109 25L121 23"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".5"
          />
          <path
            d="M178 40L188 48M194 55L199 63M39 167L44 176"
            stroke="currentColor"
            strokeWidth="5"
            opacity=".15"
          />
        </>
      ) : (
        <>
          <circle cx="265" cy="39" r="23" stroke="#b57c50" strokeWidth="1" opacity=".55" />
          <circle cx="265" cy="39" r="19" fill="#b57c50" opacity=".08" />
          <path
            d="M18 148L81 82L111 103L175 27L228 87L252 70L342 148Z"
            fill="currentColor"
            opacity=".07"
          />
          <path
            d="M28 151L104 111L131 125L208 61L248 112L282 91L351 151Z"
            fill="currentColor"
            opacity=".11"
          />
          <path d="M70 151L139 133L183 143L263 108L337 151Z" fill="currentColor" opacity=".17" />
          <path
            d="M81 83L90 108L101 101M175 28L161 68L174 61L190 82M208 63L222 95L235 107M282 93L294 120"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity=".23"
          />
          <path
            d="M5 157C75 153 104 162 153 157C222 151 257 158 352 154M71 167C139 164 175 169 234 165"
            stroke="currentColor"
            strokeWidth="1"
            opacity=".18"
          />
          <path
            d="M305 151L314 115L323 151M311 127L294 116M314 119L327 107M308 139L294 132"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity=".38"
            strokeLinecap="round"
          />
          <path
            d="M297 119C288 119 281 114 278 108C287 108 295 112 297 119ZM325 111C326 101 333 96 341 95C339 102 333 108 325 111ZM297 135C286 135 282 130 279 124C288 126 295 129 297 135Z"
            fill="currentColor"
            opacity=".2"
          />
        </>
      )}
    </svg>
  );
}
