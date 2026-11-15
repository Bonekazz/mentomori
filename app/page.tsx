"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent, ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SwappingText } from "@animate-ui/react/primitives/texts/swapping";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LIFE_EXPECTANCY = 90;
const AVERAGE_DAYS_PER_YEAR = 365.2425;

type GridLayout = {
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellSize: number;
  gap: number;
};

type Tooltip = {
  index: number;
  x: number;
  y: number;
} | null;

type GridView = "days" | "months" | "years";

const GRID_VIEWS: { value: GridView; label: string }[] = [
  { value: "days", label: "Dias" },
  { value: "months", label: "Meses" },
  { value: "years", label: "Anos" },
];

function isGridView(value: string | null): value is GridView {
  return GRID_VIEWS.some((option) => option.value === value);
}

function getTodayIsoDate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const timestamp = date.getTime();

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function addYears(timestamp: number, years: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const monthEnd = new Date(0);
  monthEnd.setUTCHours(0, 0, 0, 0);
  monthEnd.setUTCFullYear(year, month + 1, 0);
  const lastDayOfMonth = monthEnd.getUTCDate();

  date.setUTCFullYear(year, month, Math.min(day, lastDayOfMonth));
  return date.getTime();
}

function getMonthIndex(start: number, end: number) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    endDate.getUTCMonth() -
    startDate.getUTCMonth()
  );
}

function getCompletedYears(birthDate: number, date: number) {
  let years =
    new Date(date).getUTCFullYear() - new Date(birthDate).getUTCFullYear();
  if (date < addYears(birthDate, years)) years -= 1;
  return years;
}

function formatDate(timestamp: number, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(timestamp);
}

function LifeGrid({
  birthDate,
  today,
  totalDays,
  view,
}: {
  birthDate: number;
  today: number;
  totalDays: number;
  view: GridView;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<GridLayout | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const totalCells =
    view === "days"
      ? totalDays
      : view === "months"
        ? LIFE_EXPECTANCY * 12
        : LIFE_EXPECTANCY;
  const todayIndex =
    view === "days"
      ? Math.floor((today - birthDate) / DAY_IN_MS)
      : view === "months"
        ? getMonthIndex(birthDate, today)
        : getCompletedYears(birthDate, today);
  const livedCells = Math.min(totalCells, Math.max(0, todayIndex + 1));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const measure = () => {
      const width = container.clientWidth;
      if (!width) return;

      const gap = 1.5;
      const targetPitch = window.innerWidth < 640 ? 8 : 9;
      const columns = Math.min(
        totalCells,
        Math.max(12, Math.floor((width + gap) / targetPitch)),
      );
      const rows = Math.ceil(totalCells / columns);
      const cellSize = (width - (columns - 1) * gap) / columns;
      const height = rows * cellSize + (rows - 1) * gap;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      setLayout({ width, height, columns, rows, cellSize, gap });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [totalCells]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !layout) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * pixelRatio);
    canvas.height = Math.round(layout.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, layout.width, layout.height);

    const styles = getComputedStyle(canvas);
    const todayColor = styles.getPropertyValue("--grid-today").trim();
    const livedColor = styles.getPropertyValue("--grid-lived").trim();
    const futureColor = styles.getPropertyValue("--grid-future").trim();
    const futureBorderColor = styles
      .getPropertyValue("--grid-future-border")
      .trim();

    for (let index = 0; index < totalCells; index += 1) {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const x = column * (layout.cellSize + layout.gap);
      const y = row * (layout.cellSize + layout.gap);

      if (index === todayIndex && todayIndex < totalCells) {
        context.fillStyle = todayColor;
      } else if (index < livedCells) {
        context.fillStyle = livedColor;
      } else {
        context.fillStyle = futureColor;
      }

      context.fillRect(x, y, layout.cellSize, layout.cellSize);
      if (index >= livedCells && index !== todayIndex) {
        context.strokeStyle = futureBorderColor;
        context.lineWidth = 0.6;
        context.strokeRect(
          x + 0.3,
          y + 0.3,
          layout.cellSize - 0.6,
          layout.cellSize - 0.6,
        );
      }
    }
  }, [layout, livedCells, todayIndex, totalCells]);

  function showTooltip(event: PointerEvent<HTMLCanvasElement>) {
    if (!layout) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const pitch = layout.cellSize + layout.gap;
    const column = Math.floor(localX / pitch);
    const row = Math.floor(localY / pitch);
    const cellX = localX - column * pitch;
    const cellY = localY - row * pitch;
    const index = row * layout.columns + column;

    if (
      cellX > layout.cellSize ||
      cellY > layout.cellSize ||
      index < 0 ||
      index >= totalCells
    ) {
      setTooltip(null);
      return;
    }

    setTooltip({ index, x: localX, y: localY });
  }

  const tooltipDetails = tooltip
    ? (() => {
        if (view === "days") {
          const age = (
            tooltip.index / AVERAGE_DAYS_PER_YEAR
          ).toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          });
          return {
            title: formatDate(birthDate + tooltip.index * DAY_IN_MS),
            firstLine: `Dia ${tooltip.index + 1} da sua vida`,
            secondLine: `${age} anos de idade (aprox.)`,
          };
        }

        if (view === "months") {
          const monthDate = new Date(birthDate);
          monthDate.setUTCDate(1);
          monthDate.setUTCMonth(monthDate.getUTCMonth() + tooltip.index);
          return {
            title: new Intl.DateTimeFormat("pt-BR", {
              timeZone: "UTC",
              month: "long",
              year: "numeric",
            }).format(monthDate),
            firstLine: `Mês ${tooltip.index + 1} da sua vida`,
            secondLine: `${(tooltip.index / 12).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            })} anos de idade (aprox.)`,
          };
        }

        const periodStart = addYears(birthDate, tooltip.index);
        const periodEnd = addYears(birthDate, tooltip.index + 1) - DAY_IN_MS;
        return {
          title: `Ano ${tooltip.index + 1} da sua vida`,
          firstLine: `${formatDate(periodStart)} — ${formatDate(periodEnd)}`,
          secondLine: `Idade: ${tooltip.index}–${tooltip.index + 1} anos`,
        };
      })()
    : null;

  return (
    <div className="life-grid-wrap">
      <canvas
        ref={canvasRef}
        aria-label={`Representação de ${totalCells.toLocaleString("pt-BR")} ${
          view === "days" ? "dias" : view === "months" ? "meses" : "anos"
        } de uma vida de 90 anos`}
        className="life-grid"
        onPointerDown={showTooltip}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") showTooltip(event);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setTooltip(null);
        }}
        role="img"
      />
      {tooltip && tooltipDetails && (
        <div
          className="day-tooltip"
          style={{
            left: Math.min(
              Math.max(tooltip.x, 100),
              (layout?.width ?? 0) - 100,
            ),
            top: tooltip.y,
          }}
        >
          <strong>{tooltipDetails.title}</strong>
          <span>{tooltipDetails.firstLine}</span>
          <span>{tooltipDetails.secondLine}</span>
        </div>
      )}
    </div>
  );
}

function BirthDateModal({
  initialDate,
  todayIso,
  onSubmit,
  onClose,
}: {
  initialDate: string;
  todayIso: string;
  onSubmit: (date: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timestamp = parseIsoDate(date);
    const todayTimestamp = parseIsoDate(todayIso);

    if (!timestamp) {
      setError("Informe uma data de nascimento válida.");
      return;
    }

    if (todayTimestamp !== null && timestamp > todayTimestamp) {
      setError("A data de nascimento não pode estar no futuro.");
      return;
    }

    onSubmit(date);
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="birth-modal-title"
        aria-modal="true"
        className="birth-modal"
        role="dialog"
      >
        <div className="modal-mark" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">MEMENTO MORI · LEMBRE-SE DE VIVER</p>
        <h2 id="birth-modal-title">O seu tempo começa aqui.</h2>
        <blockquote>
          “Você poderia deixar a vida agora. Deixe que isso determine o que
          você faz, diz e pensa.”
          <cite>Marco Aurélio, Meditações</cite>
        </blockquote>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="birth-date">Qual é a sua data de nascimento?</label>
          <input
            autoFocus
            id="birth-date"
            max={todayIso}
            onChange={(event) => {
              setDate(event.target.value);
              setError("");
            }}
            required
            type="date"
            value={date}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button modal-submit" type="submit">
            Contemplar meus dias <span aria-hidden="true">→</span>
          </button>
          {initialDate && (
            <button
              className="text-button modal-cancel"
              onClick={onClose}
              type="button"
            >
              Voltar ao meu painel
            </button>
          )}
        </form>
        <p className="modal-footnote">Uma vida de cada vez. Um dia de cada vez.</p>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {detail && <p className="metric-detail">{detail}</p>}
      {children}
    </article>
  );
}

export default function Home() {
  const [todayIso, setTodayIso] = useState("");
  const [birthIso, setBirthIso] = useState("");
  const [modalOpen, setModalOpen] = useState(true);
  const [gridView, setGridView] = useState<GridView>("days");

  useEffect(() => {
    setTodayIso(getTodayIsoDate());
  }, []);

  const life = useMemo(() => {
    if (!birthIso || !todayIso) return null;
    const birthDate = parseIsoDate(birthIso);
    const today = parseIsoDate(todayIso);
    if (birthDate === null || today === null) return null;

    const totalDays = Math.floor(
      (addYears(birthDate, LIFE_EXPECTANCY) - birthDate) / DAY_IN_MS,
    );
    const elapsedDays = Math.floor((today - birthDate) / DAY_IN_MS);
    const livedDays = Math.min(totalDays, Math.max(0, elapsedDays + 1));
    const remainingDays = totalDays - livedDays;

    return {
      birthDate,
      today,
      totalDays,
      livedDays,
      remainingDays,
      percentage: Math.min(100, (livedDays / totalDays) * 100),
    };
  }, [birthIso, todayIso]);

  function handleBirthSubmit(date: string) {
    setBirthIso(date);
    setModalOpen(false);
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a aria-label="Memento Mori, início" className="brand" href="/">
          <span aria-hidden="true" className="brand-symbol">
            <span />
          </span>
          <span>MEMENTO MORI</span>
        </a>
        {birthIso && (
          <button
            className="change-date-button"
            onClick={() => setModalOpen(true)}
            type="button"
          >
            Alterar data <span aria-hidden="true">↗</span>
          </button>
        )}
      </header>

      <section className="intro-section">
        <p className="eyebrow">A VIDA É FINITA. O AGORA É SEU.</p>
        <h1>
          Sua vida,
          <br />
          <em className="headline-unit">
            <SwappingText
              duration={3200}
              text={["em dias.", "em meses.", "em anos."]}
            />
          </em>
        </h1>
        <p className="intro-copy">
          Cada quadrado é um recorte do seu tempo. Uma pequena lembrança de que
          o tempo não espera — e de que ainda há muito a viver.
        </p>
      </section>

      {life ? (
        <>
          <section aria-label="Resumo da sua vida" className="metrics-grid">
            <MetricCard
              detail={`Desde ${formatDate(life.birthDate, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`}
              label="Dias vividos"
              value={life.livedDays.toLocaleString("pt-BR")}
            />
            <MetricCard
              detail="O tempo que ainda é seu"
              label="Dias restantes"
              value={life.remainingDays.toLocaleString("pt-BR")}
            />
            <MetricCard
              detail="Uma vida de 90 anos"
              label="Total de dias"
              value={life.totalDays.toLocaleString("pt-BR")}
            />
            <MetricCard
              detail={`${life.percentage.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1,
              })}% da jornada`}
              label="Vida contemplada"
              value={`${Math.floor(life.percentage)}%`}
            >
              <div
                aria-label={`${life.percentage.toFixed(1)}% concluída`}
                className="progress-track"
                role="progressbar"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Number(life.percentage.toFixed(1))}
              >
                <span style={{ width: `${life.percentage}%` }} />
              </div>
            </MetricCard>
          </section>

          <section aria-labelledby="grid-title" className="grid-section">
            <div className="grid-heading">
              <div>
                <p className="eyebrow">UMA VIDA DE CADA VEZ</p>
                <h2 id="grid-title">O seu mapa do tempo</h2>
              </div>
              <p className="grid-period">90 anos · {life.totalDays.toLocaleString("pt-BR")} dias</p>
            </div>
            <div className="grid-card">
              <Select
                onValueChange={(value) => {
                  if (isGridView(value)) setGridView(value);
                }}
                value={gridView}
              >
                <SelectTrigger
                  aria-label="Escala do tabuleiro"
                  className="grid-view-trigger"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="grid-view-content"
                  sideOffset={5}
                >
                  {GRID_VIEWS.map((option) => (
                    <SelectItem
                      className="grid-view-item"
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid-legend" aria-label="Legenda do tabuleiro">
                <span><i className="legend-lived" /> Vividos</span>
                <span><i className="legend-today" /> {gridView === "days" ? "Hoje" : "Atual"}</span>
                <span><i className="legend-future" /> Por viver</span>
              </div>
              <LifeGrid
                key={gridView}
                birthDate={life.birthDate}
                today={life.today}
                totalDays={life.totalDays}
                view={gridView}
              />
              <p className="grid-hint">
                {gridView === "days"
                  ? "Toque ou passe o cursor sobre um dia para conhecê-lo."
                  : `Cada quadrado representa ${
                      gridView === "months" ? "um mês" : "um ano"
                    } da sua vida. Toque ou passe o cursor para ver os detalhes.`}
              </p>
            </div>
          </section>

          <footer className="page-footer">
            <span>“Não é que temos pouco tempo, mas desperdiçamos muito.”</span>
            <span>Sêneca · Sobre a brevidade da vida</span>
          </footer>
        </>
      ) : (
        <div aria-hidden="true" className="loading-space" />
      )}

      {modalOpen && todayIso && (
        <BirthDateModal
          initialDate={birthIso}
          onClose={() => setModalOpen(false)}
          onSubmit={handleBirthSubmit}
          todayIso={todayIso}
        />
      )}
    </main>
  );
}
