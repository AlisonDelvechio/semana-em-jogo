import noticeSource from './AppNotice.vue?raw'
import confirmSource from './ConfirmDialog.vue?raw'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { expect, it } from 'vitest'

it.each(['AppNotice', 'ConfirmDialog'])(
  'keeps %s dark styles on the component instead of the document',
  (name) => {
    const source = name === 'AppNotice' ? noticeSource : confirmSource
    const { descriptor } = parse(source)
    const css = compileStyle({
      source: descriptor.styles[0]!.content,
      filename: `${name}.vue`,
      id: 'test-theme',
      scoped: true,
    })
    expect(css.errors).toEqual([])
    expect(css.code).not.toMatch(/html\[data-theme=['"]?dark['"]?\]\s*\{/)
    expect(css.code).toContain(
      name === 'AppNotice'
        ? "html[data-theme='dark'] .app-notice"
        : "html[data-theme='dark'] .confirmation-dialog p",
    )
  },
)
