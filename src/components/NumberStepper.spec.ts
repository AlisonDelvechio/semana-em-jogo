import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NumberStepper from './NumberStepper.vue'

it('changes frequency by one and prevents values beyond either bound', async () => {
  const wrapper = mount(NumberStepper, {
    props: { modelValue: 3, inputId: 'frequency', label: 'frequência', min: 1, max: 7 },
  })
  try {
    await wrapper.get('[aria-label="Aumentar frequência"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4])
    await wrapper.setProps({ modelValue: 7 })
    expect(wrapper.get('[aria-label="Aumentar frequência"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="Diminuir frequência"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([6])
    await wrapper.setProps({ modelValue: 1 })
    expect(wrapper.get('[aria-label="Diminuir frequência"]').attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('5')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5])
  } finally {
    wrapper.unmount()
  }
})
