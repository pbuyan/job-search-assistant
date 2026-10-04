"use client";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { moveApplication } from "@/features/tracker/actions";
import {
  APPLICATION_STATUSES,
  columnId,
  findColumn,
  moveCard,
  type ApplicationStatus,
  type Board,
  type BoardCard,
} from "@/features/tracker/board";
import { ApplicationCard } from "./application-card";

export function KanbanBoard({ initial }: { initial: Board }) {
  const t = useTranslations("Tracker");
  const dndId = useId();
  const [board, setBoard] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Board and position at drag start, to detect no-op drops and to roll back.
  const start = useRef<{
    board: Board;
    status: ApplicationStatus;
    index: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press-and-hold, so a swipe still scrolls the board on touch.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const cardById = (id: UniqueIdentifier) =>
    APPLICATION_STATUSES.flatMap((s) => board[s]).find((c) => c.id === id);
  const titleOf = (id: UniqueIdentifier) =>
    cardById(id)?.title || t("card.untitled");
  const columnLabel = (id: UniqueIdentifier) => {
    const status = findColumn(board, String(id));
    return status ? t(`status.${status}`) : "";
  };

  // dnd-kit's built-in screen reader text is English; these replace it.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("a11y.picked", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("a11y.over", {
            title: titleOf(active.id),
            column: columnLabel(over.id),
          })
        : t("a11y.notOver", { title: titleOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("a11y.dropped", {
            title: titleOf(active.id),
            column: columnLabel(over.id),
          })
        : t("a11y.cancelled", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) =>
      t("a11y.cancelled", { title: titleOf(active.id) }),
  };

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    const status = findColumn(board, id);
    if (!status) return;
    setError(false);
    setActiveId(id);
    start.current = {
      board,
      status,
      index: board[status].findIndex((c) => c.id === id),
    };
  }

  // Cross-column moves happen while dragging so the target column opens a
  // gap; same-column reordering is handled by the sortable strategy.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(board, String(active.id));
    const to = findColumn(board, String(over.id));
    if (!from || !to || from === to) return;
    setBoard((b) => moveCard(b, String(active.id), String(over.id)));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    if (!over) {
      setBoard(origin.board);
      return;
    }
    const id = String(active.id);
    const next = moveCard(board, id, String(over.id));
    setBoard(next);
    const status = findColumn(next, id);
    if (!status) return;
    const index = next[status].findIndex((c) => c.id === id);
    if (status === origin.status && index === origin.index) return;

    const result = await moveApplication({ applicationId: id, status, index });
    if (!result.ok) {
      setBoard(origin.board);
      setError(true);
    }
  }

  function onDragCancel() {
    setActiveId(null);
    if (start.current) setBoard(start.current.board);
    start.current = null;
  }

  const activeCard = activeId ? cardById(activeId) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t("errors.moveFailed")}
        </p>
      ) : null}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("a11y.instructions") },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* relative: keeps the columns' sr-only text (absolutely positioned)
            inside this scroller instead of widening the page. */}
        <div className="relative flex snap-x gap-3 overflow-x-auto pb-4">
          {APPLICATION_STATUSES.map((status) => (
            <Column key={status} status={status} cards={board[status]} />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <ApplicationCard card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  cards,
}: {
  status: ApplicationStatus;
  cards: BoardCard[];
}) {
  const t = useTranslations("Tracker");
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const headingId = `tracker-column-${status}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/50 p-2 sm:w-72"
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1 px-1 pt-1">
        <h2
          id={headingId}
          className="min-w-0 text-start text-sm font-semibold wrap-break-word hyphens-auto"
        >
          {t(`status.${status}`)}
        </h2>
        <Badge variant="outline" className="tabular-nums">
          <span className="sr-only">{t("count", { count: cards.length })}</span>
          <span aria-hidden>{cards.length}</span>
        </Badge>
      </header>
      <SortableContext
        id={status}
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-0.5 transition-colors",
            isOver && "bg-muted",
          )}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ card }: { card: BoardCard }) {
  const t = useTranslations("Tracker.a11y");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    attributes: { roleDescription: t("roleDescription") },
  });

  return (
    <li>
      <div
        ref={setNodeRef}
        // Drag position is dynamic, so it has to be an inline style.
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn(
          "cursor-grab rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
          isDragging && "opacity-40",
        )}
        {...attributes}
        {...listeners}
      >
        <ApplicationCard card={card} />
      </div>
    </li>
  );
}
