/** Original vector architecture, shared by the entrance and the research map. */
export function PalaceCourtyard({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`palace-courtyard ${className}`}
      viewBox="0 0 880 660"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="440"
        cy="538"
        rx="302"
        ry="77"
        fill="#254238"
        opacity=".055"
      />
      <path d="M65 385 440 169 815 385 440 601Z" fill="#e4e7da" />
      <path d="M65 385 440 601V619L65 403Z" fill="#c7cebd" />
      <path d="M440 601 815 385V403L440 619Z" fill="#aebaab" />
      <path
        d="M82 385 440 179 798 385 440 591Z"
        fill="#f1f1e6"
        stroke="#fafbf3"
        strokeWidth="2"
      />
      <path
        d="M113 385 440 197 767 385 440 573Z"
        fill="none"
        stroke="#d2d8c6"
      />
      <g stroke="#dce1d3" strokeWidth="1" fill="none">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M${440 - i * 46} ${197 + i * 26.8}l327 188 M${440 + i * 46} ${197 + i * 26.8}l-327 188`}
          />
        ))}
      </g>
      <path
        d="m440 300 147 85-147 85-147-85Z"
        fill="#e7eadc"
        stroke="#d4dbc9"
      />
      <path d="m440 321 111 64-111 64-111-64Z" fill="none" stroke="#bdc9b3" />
      <path
        d="m440 352 57 33-57 33-57-33Z"
        fill="none"
        stroke="#b19b72"
        opacity=".65"
      />
      <g className="courtyard-arcades">
        {[-1, 1].map((side) => (
          <g key={side} transform={`matrix(${side * 0.82} .47 0 1 440 27)`}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((bay) => (
              <g key={bay} transform={`translate(${bay * 55} 0)`}>
                <path
                  d="M0 6H55V150H0ZM11 150H44V72a16.5 16.5 0 0 0-33 0Z"
                  fill={side === -1 ? "#e4e7d7" : "#d3dac7"}
                  fillRule="evenodd"
                />
                <path
                  d="M12 149V72a15.5 15.5 0 0 1 31 0v77"
                  fill="none"
                  stroke={side === -1 ? "#b7c3a8" : "#a6b698"}
                  strokeWidth="3"
                />
                <path
                  d="M7 149V71a20.5 20.5 0 0 1 41 0v78M0 24H55"
                  fill="none"
                  stroke="#f7f8ec"
                  strokeWidth="2"
                />
                <path d="M1 27H5V143H1ZM50 27H54V143H50Z" fill="#f3f4e7" />
                <path d="M0 143H9V150H0ZM46 143H55V150H46Z" fill="#c7cfb9" />
              </g>
            ))}
            <path
              d="M-5 0H445V8H-5ZM-5 15H445V21H-5Z"
              fill={side === -1 ? "#f6f6e9" : "#e1e6d4"}
              stroke="#bcc8ae"
              strokeWidth=".7"
            />
            <path d="M0 12H440" stroke="#aa956c" strokeWidth="1.5" />
          </g>
        ))}
      </g>
      <g className="courtyard-gate">
        <path d="m382 39 58-32 58 32v13H382Z" fill="#e8eadc" stroke="#bcc8b1" />
        <path d="m392 37 48-26 48 26Z" fill="#f8f7ed" />
        <path
          d="M390 48H490V180H390ZM413 180H467V99a27 27 0 0 0-54 0Z"
          fill="#edf0e1"
          fillRule="evenodd"
          stroke="#bdc9b3"
        />
        <path d="M416 179V100a24 24 0 0 1 48 0v79" fill="#365c49" />
        <path
          d="M423 178V101a17 17 0 0 1 34 0v77"
          fill="#244737"
          stroke="#ac9569"
        />
        <path
          d="M440 84V178M428 115H435M445 115H452"
          stroke="#b5a37b"
          strokeWidth="1"
        />
        <path d="M396 56H403V171H396ZM477 56H484V171H477Z" fill="#fcfcf3" />
        <path
          d="M385 174H495V181H385ZM380 181H500V188H380ZM374 188H506V195H374Z"
          fill="#d7deca"
          stroke="#b5c1a8"
          strokeWidth=".7"
        />
        <path d="m435 34 5-7 5 7-5 7Z" fill="#a88d59" />
      </g>
      <g fill="#587558">
        <path d="m116 366 16-9 16 9v17l-16 9-16-9Z" fill="#c9d2bd" />
        <ellipse cx="132" cy="350" rx="13" ry="22" />
        <path d="m732 366 16-9 16 9v17l-16 9-16-9Z" fill="#c9d2bd" />
        <ellipse cx="748" cy="350" rx="13" ry="22" />
      </g>
      <path
        d="m378 566 62 36 62-36v10l-62 36-62-36Zm-9 15 71 41 71-41v9l-71 41-71-41Z"
        fill="#dde2d0"
        stroke="#b6c1aa"
        strokeWidth=".7"
      />
    </svg>
  );
}

export function PaperPortal({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`paper-portal ${className}`}
      viewBox="0 0 100 76"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="portal-shadow"
        d="m13 65 36-13 40 14-36 10Z"
        fill="#244735"
        opacity=".13"
      />
      <path d="M28 21H74V62l-8 5H28Z" fill="#b6c4a7" />
      <path
        className="portal-stone"
        d="M22 21H68V62H22Z"
        fill="#f6f5e9"
        stroke="#a4b394"
      />
      <path
        className="portal-opening"
        d="M30 62V38a15 15 0 0 1 30 0v24Z"
        fill="#dbe3d1"
        stroke="#adb99e"
      />
      <path d="m19 19 26-14 26 14v5H19Z" fill="#edf0de" stroke="#b2bea2" />
      <path d="m27 18 18-9 18 9Z" fill="#faf9ef" />
      <path d="M25 26H28V58H25ZM62 26H65V58H62Z" fill="#fffef3" />
      <g className="portal-paper">
        <path
          d="M45 40Q38 34 32 37V55Q39 52 45 58Q51 52 58 55V37Q51 34 45 40Z"
          fill="#fffef5"
          stroke="#809875"
          strokeWidth=".8"
        />
        <path
          d="M45 40V57M35 41l7 3M35 46l7 3M49 44l6-3M49 49l6-3"
          fill="none"
          stroke="#a4b398"
          strokeWidth=".9"
        />
      </g>
      <path
        d="M20 61H70V65H20ZM15 65H75V69H15Z"
        fill="#e7e9da"
        stroke="#b2bda5"
        strokeWidth=".7"
      />
      <path d="M19 23H71" fill="none" stroke="#ac925e" strokeWidth="1.2" />
      <path d="m43 16 2-3 2 3-2 2Z" fill="#ae925b" />
    </svg>
  );
}

export function PalaceArch({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`palace-arch ${className}`}
      viewBox="0 0 160 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 193V80a68 68 0 0 1 136 0v113M22 193V80a58 58 0 0 1 116 0v113M35 193V80a45 45 0 0 1 90 0v113"
        stroke="currentColor"
      />
      <path
        d="M3 193H157M3 199H157M4 80H37M123 80H156M80 9V27"
        stroke="currentColor"
      />
    </svg>
  );
}
