import configStore, { saveConfig } from '@root/store/config'
import { t } from '@root/utils/i18n'
import { observer } from 'mobx-react'
import { FC } from 'react'
import Dropdown from '../../Dropdown'
import ActionButton from './ActionButton'

const PipOpacityButton: FC = observer(() => {
  const opacity = configStore.pipOpacity

  const menu = (
    <div className="w-[140px] bg-[#000] rounded-[4px] p-[8px] text-[12px] text-white">
      <div className="flex justify-between mb-[4px]">
        <span>{t('settingPanel.pipOpacity')}</span>
        <span>{Math.round(opacity * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        className="w-full cursor-pointer accent-[var(--color-main)]"
        onChange={(e) => {
          configStore.pipOpacity = +e.target.value
          saveConfig()
        }}
      />
    </div>
  )

  return (
    <Dropdown menuRender={() => menu}>
      <ActionButton title={t('settingPanel.pipOpacity')}>
        {Math.round(opacity * 100)}%
      </ActionButton>
    </Dropdown>
  )
})

export default PipOpacityButton
