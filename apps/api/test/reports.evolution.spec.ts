import { buildEvolution, evolutionSince } from '@ecolentes/shared';

// Miércoles 14 de octubre de 2026, 15 hs de Tucumán.
const ahora = new Date('2026-10-14T18:00:00Z');

/** Una fecha en hora de Tucumán, como la escribiría alguien de Salud. */
const tuc = (local: string) => new Date(`${local}-03:00`);

describe('buildEvolution', () => {
  it('corta las semanas de lunes a domingo en hora de Tucumán', () => {
    const { buckets } = buildEvolution('semana', [], ahora);
    expect(buckets).toHaveLength(12);
    const ultima = buckets[buckets.length - 1]!;
    expect(ultima.start).toBe(tuc('2026-10-12T00:00:00').toISOString());
    expect(ultima.current).toBe(true);
    expect(ultima.end).toBe(ahora.toISOString());
    expect(buckets[0]!.start).toBe(evolutionSince('semana', ahora).toISOString());
  });

  it('cuenta una entrega del domingo a la noche en su semana, aunque en UTC ya sea lunes', () => {
    const { buckets } = buildEvolution(
      'semana',
      [{ pairs: 2, stockPairs: 2, deliveredAt: tuc('2026-10-11T22:00:00'), events: [] }],
      ahora,
    );
    expect(buckets[10]!.deliveredPairs).toBe(2);
    expect(buckets[10]!.deliveries).toBe(1);
    expect(buckets[11]!.deliveredPairs).toBe(0);
  });

  it('reconstruye cuántos pares quedaban en el municipio al cierre de cada mes', () => {
    const { buckets } = buildEvolution(
      'mes',
      [
        // Llegó en agosto y se entregó en octubre: quedaba al cierre de agosto y septiembre.
        {
          pairs: 1,
          stockPairs: 2,
          deliveredAt: tuc('2026-10-05T10:00:00'),
          events: [
            { toStage: 'REQUEST', occurredAt: tuc('2026-07-01T10:00:00') },
            { toStage: 'RECEIVED', occurredAt: tuc('2026-08-20T10:00:00') },
            { toStage: 'READY_FOR_PICKUP', occurredAt: tuc('2026-08-25T10:00:00') },
            { toStage: 'DELIVERED', occurredAt: tuc('2026-10-05T10:00:00') },
          ],
        },
        // Llegó en septiembre y sigue esperando.
        {
          pairs: 1,
          stockPairs: 1,
          deliveredAt: null,
          events: [{ toStage: 'RECEIVED', occurredAt: tuc('2026-09-30T23:30:00') }],
        },
      ],
      ahora,
    );
    const [agosto, septiembre, octubre] = buckets.slice(-3);
    expect(agosto).toMatchObject({ arrivedPairs: 2, stockPairs: 2, deliveredPairs: 0 });
    expect(septiembre).toMatchObject({ arrivedPairs: 1, stockPairs: 3 });
    expect(octubre).toMatchObject({ current: true, arrivedPairs: 0, stockPairs: 1, deliveredPairs: 1 });
  });

  it('cierra el tramo con la entrega aunque falte el cambio de etapa', () => {
    const { buckets } = buildEvolution(
      'semana',
      [
        {
          pairs: 1,
          stockPairs: 1,
          deliveredAt: tuc('2026-10-06T09:00:00'),
          events: [{ toStage: 'RECEIVED', occurredAt: tuc('2026-10-01T09:00:00') }],
        },
      ],
      ahora,
    );
    expect(buckets[10]!.stockPairs).toBe(0);
    expect(buckets[11]!.stockPairs).toBe(0);
    expect(buckets[9]!.stockPairs).toBe(1);
  });
});
