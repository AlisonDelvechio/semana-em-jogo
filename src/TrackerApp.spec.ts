import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TrackerApp from './TrackerApp.vue'
import { createGoal, loadData, setCompleted } from './lib/data'
import { localKey } from './lib/dates'
import { goalForDate, isGoalDone } from './lib/dates'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('lets a past day use the current limit only after explicitly applying and saving it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T12:00:00'))
  const input = {
    title: 'Minha dieta',
    category: 'alimentacao' as const,
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed' as const,
    weekly_target: 1,
    free_meals_per_week: 2,
    start_date: null,
    duration_days: null,
    points: 10,
    active: true,
    meal_options: [{ id: 'almoco', label: 'Almoço' }],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
  }
  const goal = await createGoal(input)
  const data = JSON.parse(localStorage.getItem('semana-em-jogo-v1')!)
  data.goals[0].created_at = '2026-09-01T12:00:00Z'
  data.history = [
    {
      ...input,
      free_meals_per_week: 0,
      goal_id: goal.id,
      user_id: 'local',
      valid_until: '2026-10-16',
    },
  ]
  data.dayDetails = [
    {
      goal_id: goal.id,
      user_id: 'local',
      local_date: '2026-10-15',
      meal_options: input.meal_options,
      meals: { almoco: { checked: true, description: 'Livre planejada', adherent: 'free' } },
      adherence_recorded: true,
      note: '',
    },
  ]
  localStorage.setItem('semana-em-jogo-v1', JSON.stringify(data))
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    const openPastDay = async () => {
      await wrapper.get('[aria-label="Selecionar dia 15/10/2026"]').trigger('click')
      await wrapper.get('[aria-label="Abrir registros de 15/10/2026"]').trigger('click')
      await wrapper.get('.day-limit-correction summary').trigger('click')
    }
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 0 permitidas')
    await wrapper.get('.use-current-limit').trigger('click')
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 2 permitidas')
    expect((await loadData()).dayDetails[0]?.free_meals_limit_override).toBeUndefined()
    await wrapper.get('.day-dialog .dialog-close').trigger('click')
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 0 permitidas')
    await wrapper.get('.use-current-limit').trigger('click')
    await wrapper.get('.day-dialog form').trigger('submit')
    await flushPromises()
    const saved = await loadData()
    expect(saved.dayDetails[0]?.free_meals_limit_override).toBe(2)
    expect(saved.history[0]?.free_meals_per_week).toBe(0)
    const historical = goalForDate(saved.goals[0]!, saved.history, new Date(2026, 9, 15))
    expect(isGoalDone(historical, '2026-10-15', [], saved.dayDetails)).toBe(true)
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 2 permitidas')
  } finally {
    wrapper.unmount()
  }
})

it('edits the allowance and saves a compliant day with an optional free meal on mobile', async () => {
  await createGoal({
    title: 'Minha dieta',
    category: 'alimentacao',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 1,
    free_meals_per_week: 2,
    start_date: null,
    duration_days: null,
    points: 10,
    active: true,
    meal_options: [
      { id: 'almoco', label: 'Almoço' },
      { id: 'jantar', label: 'Jantar' },
    ],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    await wrapper.get('[aria-label="Editar Minha dieta"]').trigger('click')
    await wrapper.get('[aria-describedby="free-meal-help"]').setValue('1')
    await wrapper.get('.goal-form').trigger('submit')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect((await loadData()).goals[0]?.free_meals_per_week).toBe(1)

    await wrapper.findAll('.mobile-nav button')[0]!.trigger('click')
    expect(
      wrapper
        .get('.free-meal-overview')
        .element.compareDocumentPosition(wrapper.get('.days-grid').element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(wrapper.find('.days-grid .task-category-icon').exists()).toBe(true)
    await wrapper.get('.day-edit-action').trigger('click')
    const meals = wrapper.findAll('.meal-row')
    for (const meal of meals) {
      await meal.get('input[type="checkbox"]').setValue(true)
      await meal.get('select').setValue('free')
    }
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('2 de 1 permitidas')
    expect(wrapper.findAll('.free-meal-warning')).toHaveLength(1)
    await meals[1]!.get('select').setValue('true')
    expect(wrapper.findAll('.free-meal-warning')).toHaveLength(0)
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 1 permitidas')
    await wrapper.get('.day-dialog form').trigger('submit')
    await flushPromises()
    const data = await loadData()
    expect(data.dayDetails[0]?.meals.almoco?.adherent).toBe('free')
    expect(data.dayDetails[0]?.meals.jantar?.adherent).toBe(true)
    expect(isGoalDone(data.goals[0]!, data.dayDetails[0]!.local_date, [], data.dayDetails)).toBe(
      true,
    )
  } finally {
    wrapper.unmount()
  }
})

it('confirms deletion, supports Escape and restores focus without deleting on cancel', async () => {
  const goal = await createGoal({
    title: 'Academia',
    category: 'treino',
    scheduled_weekdays: [1],
    goal_mode: 'fixed',
    weekly_target: 3,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    const trigger = wrapper.get('[aria-label="Excluir Academia"]')
    ;(trigger.element as HTMLButtonElement).focus()
    await trigger.trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('não pode ser desfeita')
    expect(document.activeElement?.textContent).toBe('Cancelar')
    expect((await loadData()).goals[0]?.id).toBe(goal.id)
    await wrapper.get('[role="alertdialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect((await loadData()).goals).toHaveLength(1)
    await trigger.trigger('click')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect((await loadData()).goals).toHaveLength(0)
    expect(wrapper.get('.app-notice').text()).toContain('Meta excluída')
    await wrapper.get('[aria-label="Fechar mensagem"]').trigger('click')
    expect(wrapper.find('.app-notice').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('separates weekly and monthly progress and edits goals in a modal without points', async () => {
  await createGoal({
    title: 'Academia',
    category: 'treino',
    scheduled_weekdays: [1],
    goal_mode: 'fixed',
    weekly_target: 3,
    points: 25,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    const cards = wrapper.findAll('.period-progress-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.get('h2').text()).toBe('Semana')
    expect(cards[1]!.get('h2').text()).toBe('Mês')
    expect(wrapper.text()).not.toContain('PONTOS CONQUISTADOS')
    expect(wrapper.text()).not.toContain('METAS NA SEMANA')
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    expect(wrapper.find('.goal-form').exists()).toBe(false)
    await wrapper.get('[aria-label="Editar Academia"]').trigger('click')
    expect(wrapper.get('.goal-editor-dialog').attributes('role')).toBe('dialog')
    expect(document.body.style.overflow).toBe('hidden')
    expect(wrapper.get('.goal-form').text()).not.toContain('Pontos')
    await wrapper.get('.goal-form input[maxlength="100"]').setValue('Alteração cancelada')
    await wrapper.get('[aria-label="Fechar edição da meta"]').trigger('click')
    expect(wrapper.find('.goal-editor-dialog').exists()).toBe(false)
    expect((await loadData()).goals[0]?.title).toBe('Academia')
    await wrapper.get('[aria-label="Editar Academia"]').trigger('click')
    expect(
      (wrapper.get('.goal-form input[maxlength="100"]').element as HTMLInputElement).value,
    ).toBe('Academia')
    await wrapper.get('.goal-form input[maxlength="100"]').setValue('Treino de força')
    await wrapper.get('.goal-form').trigger('submit')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.goal-editor-dialog').exists()).toBe(false)
    expect((await loadData()).goals[0]?.title).toBe('Treino de força')
    expect((await loadData()).goals[0]?.points).toBe(25)
    expect(document.body.style.overflow).toBe('')
  } finally {
    wrapper.unmount()
  }
})

it('creates a goal through the mobile dialog and cancels with Escape', async () => {
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.get('.week-layout .page-heading .small-button').trigger('click')
    expect(wrapper.get('#goal-editor-title').text()).toBe('Nova meta')
    await wrapper.get('.goal-editor-dialog').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.goal-editor-dialog').exists()).toBe(false)
    expect((await loadData()).goals).toHaveLength(0)
    expect(document.body.style.overflow).toBe('')
  } finally {
    wrapper.unmount()
  }
})

it('keeps completed state accessible without a visual label and preserves frequency controls', async () => {
  const goal = await createGoal({
    title: 'Treinar',
    category: 'treino',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'weekly',
    weekly_target: 3,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  await setCompleted(goal.id, localKey(new Date()), true)
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    expect(wrapper.find('.task.done .task-state').exists()).toBe(false)
    expect(wrapper.get('.task.done').attributes('aria-label')).toContain('Concluída')
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    await wrapper.get('[aria-label="Editar Treinar"]').trigger('click')
    const select = wrapper.get('.goal-basics-row .select-control select')
    expect(select.element.tagName).toBe('SELECT')
    expect(wrapper.get('.select-chevron').attributes('aria-hidden')).toBe('true')
    await wrapper.get('[aria-label="Aumentar frequência semanal"]').trigger('click')
    expect((wrapper.get('#weekly-target').element as HTMLInputElement).value).toBe('4')
    await wrapper.get('.goal-period-settings input[type="checkbox"]').setValue(true)
    await wrapper.get('.period-fields input[type="number"]').setValue(14)
    await wrapper.get('.goal-form').trigger('submit')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect((await loadData()).goals[0]?.weekly_target).toBe(4)
    expect((await loadData()).goals[0]?.duration_days).toBe(14)
    expect((await loadData()).goals[0]?.start_date).toBe(localKey(new Date()))
  } finally {
    wrapper.unmount()
  }
})

it('shows one selected day on mobile, navigates weeks and omits the footer', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T12:00:00'))
  await createGoal({
    title: 'Treinar',
    category: 'treino',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 3,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: '2026-10-01',
    duration_days: null,
  })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.findAll('.week-strip button')).toHaveLength(7)
    expect(wrapper.findAll('.days-grid .day-card')).toHaveLength(1)
    expect(wrapper.get('.week-strip [aria-pressed="true"]').attributes('aria-label')).toContain(
      '16/10/2026',
    )
    expect(wrapper.find('footer').exists()).toBe(false)
    await wrapper.get('[aria-label="Selecionar dia 15/10/2026"]').trigger('click')
    expect(wrapper.findAll('.days-grid .day-card')).toHaveLength(1)
    expect(wrapper.get('.day-open').attributes('aria-label')).toContain('15/10/2026')
    await wrapper.get('[aria-label="Semana anterior"]').trigger('click')
    expect(wrapper.get('.week-strip [aria-pressed="true"]').attributes('aria-label')).toContain(
      '05/10/2026',
    )
    await wrapper.get('.week-section > .today-link').trigger('click')
    expect(wrapper.get('.day-open').attributes('aria-label')).toContain('16/10/2026')
  } finally {
    wrapper.unmount()
  }
})

it('keeps all seven day cards visible on desktop', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }))
  await createGoal({
    title: 'Treinar',
    category: 'treino',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 3,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.findAll('.days-grid .day-card')).toHaveLength(7)
    expect(wrapper.find('.week-strip').exists()).toBe(false)
    expect(wrapper.find('footer').exists()).toBe(true)
  } finally {
    wrapper.unmount()
  }
})

it('uses only one modal when moving from the calendar summary to editing a day', async () => {
  await createGoal({
    title: 'Dieta',
    category: 'alimentacao',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 1,
    points: 10,
    active: true,
    meal_options: [{ id: 'lunch', label: 'Almoço' }],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    expect(
      wrapper.findAll('.progress-overview > article').map((card) => card.get('h2').text()),
    ).toEqual(['Hoje', 'Semana', 'Mês'])
    await wrapper.findAll('.mobile-nav button')[1]!.trigger('click')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    await wrapper.get('.calendar-day.is-today').trigger('click')
    await flushPromises()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(wrapper.get('.dashboard').attributes('inert')).toBeDefined()
    ;(
      document.querySelector('.calendar-summary-modal .day-edit-action') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(document.querySelector('.calendar-summary-modal')).toBeNull()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(wrapper.find('.day-dialog').exists()).toBe(true)
    await wrapper.get('.day-dialog .dialog-close').trigger('click')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    expect(wrapper.get('.dashboard').attributes('inert')).not.toBe('true')
  } finally {
    wrapper.unmount()
  }
})

it('validates PDF dates before opening a printable report for the selected range', async () => {
  await createGoal({
    title: 'Treinar',
    category: 'treino',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 1,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: '2026-10-01',
    duration_days: null,
  })
  const reportDocument = document.implementation.createHTMLDocument()
  const popup = {
    document: reportDocument,
    opener: window,
    onload: null as (() => void) | null,
    focus: vi.fn<() => void>(),
    print: vi.fn<() => void>(),
  }
  const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    await wrapper.get('.report-panel select').setValue('range')
    const dates = wrapper.findAll('.report-dates input')
    await dates[0]!.setValue('2026-10-13')
    await dates[1]!.setValue('2026-10-12')
    await wrapper.get('.report-export-actions .primary-button').trigger('click')
    expect(open).not.toHaveBeenCalled()
    expect(wrapper.get('.report-notice').text()).toContain('intervalo de datas válido')
    await dates[1]!.setValue('2026-10-13')
    await wrapper.get('.report-export-actions .primary-button').trigger('click')
    expect(open).toHaveBeenCalledOnce()
    expect(reportDocument.querySelector('header')!.textContent).toContain('13/10/2026 a 13/10/2026')
    expect(reportDocument.querySelectorAll('.record')).toHaveLength(1)
    popup.onload!()
    expect(popup.print).toHaveBeenCalledOnce()
    // The popup inherits the page CSP, so the button has no inline handler.
    const printButton = reportDocument.querySelector<HTMLButtonElement>('[data-print]')!
    expect(printButton.getAttribute('onclick')).toBeNull()
    printButton.click()
    expect(popup.print).toHaveBeenCalledTimes(2)
  } finally {
    wrapper.unmount()
  }
})

it('reloads records and moves to the new day when the page becomes visible again', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T23:58:00'))
  const goal = {
    category: 'treino' as const,
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed' as const,
    weekly_target: 1,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  }
  await createGoal({ ...goal, title: 'Alongar' })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.find('.day-card.is-today').text()).toContain('Alongar')
    // Another tab saves a goal while this one sits in the background past midnight.
    await createGoal({ ...goal, title: 'Caminhar' })
    vi.setSystemTime(new Date('2026-11-09T07:00:00'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    const today = wrapper.find('.day-card.is-today')
    expect(today.exists()).toBe(true)
    expect(today.text()).toContain('Caminhar')
  } finally {
    wrapper.unmount()
  }
})
