import type { TileSpec } from '../../shared/api';

type TileSvgProps = {
  tile: TileSpec;
  visualAngle: number;
  energized: boolean;
  solved: boolean;
};

export const TileSvg = ({ tile, visualAngle, energized, solved }: TileSvgProps) => {
  const strokeColor = solved && energized ? '#0d7a5f' : energized ? '#d9441e' : '#b2a796';
  const glowColor = solved && energized ? 'rgba(13,122,95,0.28)' : 'rgba(217,68,30,0.26)';
  const capColor = energized ? '#c4963c' : '#b5a78f';

  if (tile.kind === 'block') {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full select-none" aria-hidden="true">
        <rect
          x="16"
          y="16"
          width="68"
          height="68"
          rx="10"
          fill="#cfc3ac"
          stroke="#b3a488"
          strokeWidth="2.5"
        />
        <line x1="28" y1="28" x2="72" y2="72" stroke="#b3a488" strokeWidth="3" strokeLinecap="round" />
        <line x1="72" y1="28" x2="28" y2="72" stroke="#b3a488" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="24" r="3" fill="#a5967a" />
        <circle cx="76" cy="24" r="3" fill="#a5967a" />
        <circle cx="24" cy="76" r="3" fill="#a5967a" />
        <circle cx="76" cy="76" r="3" fill="#a5967a" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full select-none" aria-hidden="true">
      {/* Rotating trace group */}
      <g
        style={{
          transformOrigin: '50px 50px',
          transform: `rotate(${visualAngle}deg)`,
          transition: 'transform 170ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Soft aura under energized traces */}
        {energized && (
          <g stroke={glowColor} strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {tile.kind === 'source' && <line x1="50" y1="50" x2="100" y2="50" />}
            {tile.kind === 'target' && <line x1="0" y1="50" x2="50" y2="50" />}
            {tile.kind === 'straight' && <line x1="50" y1="0" x2="50" y2="100" />}
            {tile.kind === 'corner' && <path d="M 50 0 L 50 50 L 100 50" />}
            {tile.kind === 'tee' && (
              <>
                <line x1="50" y1="0" x2="50" y2="100" />
                <line x1="50" y1="50" x2="100" y2="50" />
              </>
            )}
            {tile.kind === 'cross' && (
              <>
                <line x1="50" y1="0" x2="50" y2="100" />
                <line x1="0" y1="50" x2="100" y2="50" />
              </>
            )}
          </g>
        )}

        {/* Recessed trace channel */}
        <g stroke="#dfd6c4" strokeWidth="18" strokeLinecap="butt" strokeLinejoin="round" fill="none">
          {tile.kind === 'source' && <line x1="50" y1="50" x2="100" y2="50" />}
          {tile.kind === 'target' && <line x1="0" y1="50" x2="50" y2="50" />}
          {tile.kind === 'straight' && <line x1="50" y1="0" x2="50" y2="100" />}
          {tile.kind === 'corner' && <path d="M 50 0 L 50 50 L 100 50" />}
          {tile.kind === 'tee' && (
            <>
              <line x1="50" y1="0" x2="50" y2="100" />
              <line x1="50" y1="50" x2="100" y2="50" />
            </>
          )}
          {tile.kind === 'cross' && (
            <>
              <line x1="50" y1="0" x2="50" y2="100" />
              <line x1="0" y1="50" x2="100" y2="50" />
            </>
          )}
        </g>

        {/* Conductive copper / signal trace */}
        <g stroke={strokeColor} strokeWidth="11" strokeLinecap="butt" strokeLinejoin="round" fill="none">
          {tile.kind === 'source' && <line x1="50" y1="50" x2="100" y2="50" />}
          {tile.kind === 'target' && <line x1="0" y1="50" x2="50" y2="50" />}
          {tile.kind === 'straight' && <line x1="50" y1="0" x2="50" y2="100" />}
          {tile.kind === 'corner' && <path d="M 50 0 L 50 50 L 100 50" />}
          {tile.kind === 'tee' && (
            <>
              <line x1="50" y1="0" x2="50" y2="100" />
              <line x1="50" y1="50" x2="100" y2="50" />
            </>
          )}
          {tile.kind === 'cross' && (
            <>
              <line x1="50" y1="0" x2="50" y2="100" />
              <line x1="0" y1="50" x2="100" y2="50" />
            </>
          )}
        </g>

        {/* Brass edge connector pins */}
        {tile.kind === 'source' && <rect x="92" y="42" width="8" height="16" rx="2" fill={capColor} />}
        {tile.kind === 'target' && <rect x="0" y="42" width="8" height="16" rx="2" fill={capColor} />}
        {(tile.kind === 'straight' || tile.kind === 'tee' || tile.kind === 'cross') && (
          <>
            <rect x="42" y="0" width="16" height="6" rx="2" fill={capColor} />
            <rect x="42" y="94" width="16" height="6" rx="2" fill={capColor} />
          </>
        )}
        {tile.kind === 'corner' && (
          <>
            <rect x="42" y="0" width="16" height="6" rx="2" fill={capColor} />
            <rect x="94" y="42" width="6" height="16" rx="2" fill={capColor} />
          </>
        )}
        {tile.kind === 'tee' && <rect x="94" y="42" width="6" height="16" rx="2" fill={capColor} />}
        {tile.kind === 'cross' && (
          <>
            <rect x="0" y="42" width="6" height="16" rx="2" fill={capColor} />
            <rect x="94" y="42" width="6" height="16" rx="2" fill={capColor} />
          </>
        )}

        {/* Center hub */}
        {(tile.kind === 'corner' || tile.kind === 'tee' || tile.kind === 'cross') && (
          <circle cx="50" cy="50" r="8" fill={strokeColor} />
        )}
      </g>

      {/* Non-rotating hardware overlays: Source, Target, or Mandatory Relay */}
      {tile.kind === 'source' && (
        <g>
          <circle cx="50" cy="50" r="24" fill="#d9441e" stroke="#f7e5cf" strokeWidth="4" />
          <circle cx="50" cy="50" r="14" fill="#ff844b" />
          <text
            x="50"
            y="54"
            textAnchor="middle"
            fontSize="12"
            fontWeight="800"
            fill="#ffffff"
            letterSpacing="0.5"
          >
            IN
          </text>
        </g>
      )}

      {tile.kind === 'target' && (
        <g>
          <circle
            cx="50"
            cy="50"
            r="24"
            fill={energized ? '#0d7a5f' : '#4a4740'}
            stroke={energized ? '#bcead9' : '#c7baa2'}
            strokeWidth="4"
          />
          <circle cx="50" cy="50" r="14" fill={energized ? '#22b38c' : '#6c675d'} />
          <text
            x="50"
            y="54"
            textAnchor="middle"
            fontSize="11"
            fontWeight="800"
            fill="#ffffff"
            letterSpacing="0.4"
          >
            OUT
          </text>
        </g>
      )}

      {tile.relay && (
        <g>
          <circle
            cx="50"
            cy="50"
            r="17"
            fill={energized ? '#f8b93a' : '#efe7d6'}
            stroke={energized ? '#9a6309' : '#b48d3e'}
            strokeWidth="3.5"
          />
          <path
            d="M 52 39 L 43 51 L 50 51 L 48 61 L 57 49 L 50 49 Z"
            fill={energized ? '#1d2128' : '#8c6924'}
          />
        </g>
      )}

      {/* Corner lock screws on locked tiles */}
      {tile.locked && (
        <>
          <circle cx="13" cy="13" r="2.8" fill="#b89040" />
          <circle cx="87" cy="13" r="2.8" fill="#b89040" />
          <circle cx="13" cy="87" r="2.8" fill="#b89040" />
          <circle cx="87" cy="87" r="2.8" fill="#b89040" />
        </>
      )}
    </svg>
  );
};
