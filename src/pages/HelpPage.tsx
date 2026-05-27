import {
  Stack,
  Title,
  Text,
  Accordion,
  Card,
  List,
  ThemeIcon,
  Group,
  Code,
  Badge,
  Alert,
  Anchor,
  Divider,
  Box,
  SimpleGrid,
} from '@mantine/core';
import {
  IconBook,
  IconRocket,
  IconWand,
  IconPalette,
  IconLanguage,
  IconEye,
  IconPhoto,
  IconDeviceFloppy,
  IconBolt,
  IconAdjustments,
  IconFileText,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconExternalLink,
  IconBulb,
  IconTrash,
  IconArchive,
  IconCircleNumber1,
  IconCircleNumber2,
  IconCircleNumber3,
  IconCircleNumber4,
  IconCircleNumber5,
} from '@tabler/icons-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useTranslation } from '../i18n/useTranslation';

// ImageCreator の使い方を一覧で説明するヘルプページ
// Accordion で全セクション折りたたみ可能、サイドバーから誰でもアクセス可能
export function HelpPage() {
  const { t } = useTranslation();

  const openExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('URL を開けませんでした:', e);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{t('help.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('help.subtitle')}
        </Text>
      </div>

      {/* 概要カード */}
      <Card withBorder padding="lg" radius="md">
        <Group gap="md">
          <ThemeIcon color="image-creator" size={56} radius="xl" variant="light">
            <IconBook size={32} />
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Title order={4}>{t('help.overview.title')}</Title>
            <Text size="sm" c="dimmed" mt={4}>
              {t('help.overview.body')}
            </Text>
          </div>
        </Group>
      </Card>

      {/* メイン: Accordion で機能別ガイド */}
      <Accordion variant="separated" multiple defaultValue={['quickstart']}>
        {/* ---- クイックスタート ---- */}
        <Accordion.Item value="quickstart">
          <Accordion.Control
            icon={
              <ThemeIcon color="image-creator" size={28} radius="xl" variant="light">
                <IconRocket size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.qs.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.qs.lead')}</Text>
              <List
                spacing="md"
                size="sm"
                center
                icon={
                  <ThemeIcon color="gray" size={24} radius="xl" variant="light">
                    <IconCircleNumber1 size={14} />
                  </ThemeIcon>
                }
              >
                <List.Item
                  icon={
                    <ThemeIcon color="image-creator" size={24} radius="xl">
                      <IconCircleNumber1 size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text fw={500}>{t('help.qs.step1.title')}</Text>
                  <Text size="xs" c="dimmed">
                    {t('help.qs.step1.body')}
                  </Text>
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="image-creator" size={24} radius="xl">
                      <IconCircleNumber2 size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text fw={500}>{t('help.qs.step2.title')}</Text>
                  <Text size="xs" c="dimmed">
                    {t('help.qs.step2.bodyPre')}<Code>ComfyUI</Code>{t('help.qs.step2.bodyPost')}
                  </Text>
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="image-creator" size={24} radius="xl">
                      <IconCircleNumber3 size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text fw={500}>{t('help.qs.step3.title')}</Text>
                  <Text size="xs" c="dimmed">
                    <Code>{t('gen.llm.label')}</Code>{t('help.qs.step3.bodyPost')}
                  </Text>
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="image-creator" size={24} radius="xl">
                      <IconCircleNumber4 size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text fw={500}>{t('help.qs.step4.title')}</Text>
                  <Text size="xs" c="dimmed">
                    {t('help.qs.step4.body')}
                  </Text>
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="image-creator" size={24} radius="xl">
                      <IconCircleNumber5 size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text fw={500}>{t('help.qs.step5.title')}</Text>
                  <Text size="xs" c="dimmed">
                    {t('help.qs.step5.body')}
                  </Text>
                </List.Item>
              </List>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- シンプルモード ---- */}
        <Accordion.Item value="simple-mode">
          <Accordion.Control
            icon={
              <ThemeIcon color="blue" size={28} radius="xl" variant="light">
                <IconWand size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.simple.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.simple.lead')}</Text>
              <Card padding="sm" radius="sm" withBorder>
                <Stack gap="xs">
                  <Group gap="xs">
                    <Badge variant="filled" color="image-creator">{t('help.simple.input')}</Badge>
                    <Text size="sm" fw={500}>{t('help.simple.prompt.title')}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t('help.simple.prompt.body')}
                  </Text>

                  <Group gap="xs" mt="xs">
                    <Badge variant="filled" color="image-creator">{t('help.simple.select')}</Badge>
                    <Text size="sm" fw={500}>{t('help.simple.size.title')}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    <Code>{t('gen.simple.square')} (1024×1024)</Code>{t('help.simple.size.bodyMid1')}<Code>{t('gen.simple.portrait')} (832×1216)</Code>{t('help.simple.size.bodyMid1')}<Code>{t('gen.simple.landscape')} (1216×832)</Code>{t('help.simple.size.bodyMid2')}
                  </Text>

                  <Group gap="xs" mt="xs">
                    <Badge variant="filled" color="image-creator">{t('help.simple.select')}</Badge>
                    <Text size="sm" fw={500}>{t('help.simple.count.title')}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t('help.simple.count.body')}
                  </Text>

                  <Group gap="xs" mt="xs">
                    <Badge variant="light" color="teal">{t('help.simple.autoAdd')}</Badge>
                    <Text size="xs">
                      {t('help.simple.prefix.bodyPre')}<Code>masterpiece, best quality, score_7, safe,</Code>{t('help.simple.prefix.bodyPost')}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- 詳細モード ---- */}
        <Accordion.Item value="advanced-mode">
          <Accordion.Control
            icon={
              <ThemeIcon color="grape" size={28} radius="xl" variant="light">
                <IconAdjustments size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.adv.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">
                {t('help.adv.leadPre')}<Code>{t('gen.simple')} / {t('gen.advanced')}</Code>{t('help.adv.leadPost')}
              </Text>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.prompt.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.prompt.body')}
                  </Text>
                </Card>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.res.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.res.body')}
                  </Text>
                </Card>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.sampler.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.sampler.bodyPre')}<Code>euler_ancestral</Code>{t('help.adv.sampler.bodyPost')}
                  </Text>
                </Card>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.seed.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.seed.body')}
                  </Text>
                </Card>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.ext.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.ext.body')}
                  </Text>
                </Card>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="sm" fw={500}>{t('help.adv.reset.title')}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('help.adv.reset.body')}
                  </Text>
                </Card>
              </SimpleGrid>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- プロンプトのコツ ---- */}
        <Accordion.Item value="prompt-tips">
          <Accordion.Control
            icon={
              <ThemeIcon color="teal" size={28} radius="xl" variant="light">
                <IconBulb size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.tips.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Box>
                <Text size="sm" fw={600} mb={4}>
                  {t('help.tips.goodTitle')}
                </Text>
                <List size="sm" spacing={4}>
                  <List.Item>
                    <Text size="sm">
                      <b>{t('help.tips.goodSpecificBold')}</b>{t('help.tips.goodSpecific')}
                    </Text>
                  </List.Item>
                  <List.Item>
                    <Text size="sm">
                      <b>{t('help.tips.goodVisualBold')}</b>{t('help.tips.goodVisual')}
                    </Text>
                  </List.Item>
                  <List.Item>
                    <Text size="sm">
                      <b>{t('help.tips.goodSceneBold')}</b>{t('help.tips.goodScene')}
                    </Text>
                  </List.Item>
                  <List.Item>
                    <Text size="sm">
                      <b>{t('help.tips.goodLengthBold')}</b>{t('help.tips.goodLength')}
                    </Text>
                  </List.Item>
                </List>
              </Box>

              <Divider />

              <Box>
                <Text size="sm" fw={600} mb={4}>
                  {t('help.tips.exTitle')}
                </Text>
                <Stack gap="xs">
                  <Card padding="xs" radius="sm" withBorder>
                    <Text size="xs" c="dimmed">{t('help.tips.exInputJa')}</Text>
                    <Text size="sm">{t('help.tips.exInput1')}</Text>
                    <Text size="xs" c="dimmed" mt={4}>{t('help.tips.exOutputEn')}</Text>
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                      1girl, solo, blonde_hair, smile, blue_sky, white_dress, outdoors,
                      sunlight, looking_at_viewer
                    </Text>
                  </Card>
                  <Card padding="xs" radius="sm" withBorder>
                    <Text size="xs" c="dimmed">{t('help.tips.exInputJa')}</Text>
                    <Text size="sm">{t('help.tips.exInput2')}</Text>
                    <Text size="xs" c="dimmed" mt={4}>{t('help.tips.exOutputEn')}</Text>
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                      1boy, solo, black_hair, salaryman, suit, walking, city, night, rain,
                      wet_streets, neon_lights
                    </Text>
                  </Card>
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Text size="sm" fw={600} mb={4}>
                  {t('help.tips.negTitle')}
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  {t('help.tips.negDesc')}
                </Text>
                <Card padding="xs" radius="sm" withBorder>
                  <Text size="xs" style={{ fontFamily: 'monospace' }}>
                    worst quality, low quality, score_1, score_2, score_3, artist name
                  </Text>
                </Card>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('help.tips.negAdvancedPre')}<Code>extra fingers, bad anatomy, blurry</Code>
                </Text>
              </Box>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- プロンプト変換 ---- */}
        <Accordion.Item value="translation">
          <Accordion.Control
            icon={
              <ThemeIcon color="cyan" size={28} radius="xl" variant="light">
                <IconLanguage size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.tr.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.tr.body')}</Text>
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={4}>{t('help.tr.flowTitle')}</Text>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                  {t('help.tr.flow')}
                </Text>
              </Card>
              <Alert variant="light" color="teal" icon={<IconBulb size={16} />}>
                <Text size="sm">{t('help.tr.cache')}</Text>
              </Alert>
              <Text size="sm" c="dimmed">
                {t('help.tr.editHint')}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- ライブプレビュー ---- */}
        <Accordion.Item value="live-preview">
          <Accordion.Control
            icon={
              <ThemeIcon color="orange" size={28} radius="xl" variant="light">
                <IconEye size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.live.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.live.body')}</Text>
              <List size="sm" spacing={4}>
                <List.Item icon={<IconCircleCheck size={14} color="green" />}>
                  {t('help.live.item1')}
                </List.Item>
                <List.Item icon={<IconCircleCheck size={14} color="green" />}>
                  {t('help.live.item2')}
                </List.Item>
                <List.Item icon={<IconCircleCheck size={14} color="green" />}>
                  {t('help.live.item3')}
                </List.Item>
                <List.Item icon={<IconCircleCheck size={14} color="green" />}>
                  {t('help.live.item4')}
                </List.Item>
              </List>
              <Alert variant="light" color="orange">
                <Text size="xs">
                  {t('help.live.statusHintPre')}<Code>{t('gen.liveConnected')}</Code>{t('help.live.statusHintPost')}
                </Text>
              </Alert>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- ギャラリー ---- */}
        <Accordion.Item value="gallery">
          <Accordion.Control
            icon={
              <ThemeIcon color="pink" size={28} radius="xl" variant="light">
                <IconPhoto size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.gallery.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.gallery.body')}</Text>

              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.gallery.storageTitle')}</Text>
                <List size="xs" spacing={2}>
                  <List.Item>
                    <b>{t('help.gallery.storage.dbBold')}</b>: <Code>%LOCALAPPDATA%\ImageCreator\gallery.db</Code>
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.storage.fullBold')}</b>: <Code>&lt;data folder&gt;\gallery\full\</Code>
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.storage.thumbBold')}</b>: <Code>&lt;data folder&gt;\gallery\thumb\</Code>
                  </List.Item>
                </List>
              </Card>

              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.gallery.actionsTitle')}</Text>
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>{t('help.gallery.action.clickBold')}</b>{t('help.gallery.action.click')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.action.regenBold')}</b>{t('help.gallery.action.regen')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.action.saveBold')}</b>{t('help.gallery.action.save')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.action.favBold')}</b>{t('help.gallery.action.fav')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.gallery.action.delBold')}</b>{t('help.gallery.action.del')}
                  </List.Item>
                </List>
              </Card>

              <Alert variant="light" color="teal" icon={<IconDeviceFloppy size={16} />}>
                <Text size="sm">
                  {t('help.gallery.metaInfoPre')}<b>{t('help.gallery.metaInfoBold')}</b>{t('help.gallery.metaInfoPost')}
                </Text>
              </Alert>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- Turbo LoRA ---- */}
        <Accordion.Item value="turbo-lora">
          <Accordion.Control
            icon={
              <ThemeIcon color="yellow" size={28} radius="xl" variant="light">
                <IconBolt size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.turbo.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">
                {t('help.turbo.bodyPre')}<b>{t('help.turbo.bodyBold')}</b>{t('help.turbo.bodyPost')}
              </Text>
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.turbo.howTitle')}</Text>
                <List size="sm" spacing={4}>
                  <List.Item>{t('help.turbo.how.step1')}</List.Item>
                  <List.Item>{t('help.turbo.how.step2')}</List.Item>
                  <List.Item>{t('help.turbo.how.step3')}</List.Item>
                  <List.Item>{t('help.turbo.how.step4')}</List.Item>
                </List>
              </Card>
              <Alert variant="light" color="yellow">
                <Text size="xs">
                  {t('help.turbo.alertPre')}<Code>anima_turbo.json</Code>{t('help.turbo.alertPost')}
                </Text>
              </Alert>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- 設定 ---- */}
        <Accordion.Item value="settings">
          <Accordion.Control
            icon={
              <ThemeIcon color="indigo" size={28} radius="xl" variant="light">
                <IconPalette size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.settings.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Box>
                <Text size="sm" fw={600}>{t('help.settings.generalTitle')}</Text>
                <List size="sm" spacing={2}>
                  <List.Item>
                    <b>{t('help.settings.general.langBold')}</b>{t('help.settings.general.lang')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.settings.general.folderBold')}</b>{t('help.settings.general.folder')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.settings.general.setupBold')}</b>{t('help.settings.general.setup')}
                  </List.Item>
                </List>
              </Box>
              <Divider />
              <Box>
                <Text size="sm" fw={600}>{t('help.settings.modelsTitle')}</Text>
                <Text size="sm">
                  {t('help.settings.modelsBody')}
                </Text>
              </Box>
              <Divider />
              <Box>
                <Text size="sm" fw={600}>{t('help.settings.aboutTitle')}</Text>
                <List size="sm" spacing={2}>
                  <List.Item>
                    <b>{t('help.settings.about.storageBold')}</b>{t('help.settings.about.storage')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.settings.about.cacheBold')}</b>{t('help.settings.about.cache')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.settings.about.resetBold')}</b>{t('help.settings.about.reset')}
                  </List.Item>
                </List>
              </Box>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- ログ ---- */}
        <Accordion.Item value="logs">
          <Accordion.Control
            icon={
              <ThemeIcon color="gray" size={28} radius="xl" variant="light">
                <IconFileText size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.logs.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">{t('help.logs.body')}</Text>
              <List size="sm" spacing={4}>
                <List.Item>
                  <b>{t('help.logs.appBold')}</b>{t('help.logs.app')}
                </List.Item>
                <List.Item>
                  <b>{t('help.logs.comfyBold')}</b>{t('help.logs.comfy')}
                </List.Item>
                <List.Item>
                  <b>{t('help.logs.llamaBold')}</b>{t('help.logs.llama')}
                </List.Item>
              </List>
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.logs.featTitle')}</Text>
                <List size="xs" spacing={2}>
                  <List.Item>{t('help.logs.featAutoRefresh')}</List.Item>
                  <List.Item>{t('help.logs.featFilter')}</List.Item>
                  <List.Item>{t('help.logs.featCopyClear')}</List.Item>
                </List>
              </Card>

              <Divider />

              <Text size="sm" fw={600}>{t('help.logs.faqTitle')}</Text>
              <List size="sm" spacing="xs">
                <List.Item icon={<IconCircleX size={14} color="red" />}>
                  <b>{t('help.logs.faq.comfyBold')}</b>{t('help.logs.faq.comfy')}
                </List.Item>
                <List.Item icon={<IconCircleX size={14} color="red" />}>
                  <b>{t('help.logs.faq.vramBold')}</b>{t('help.logs.faq.vram')}
                </List.Item>
                <List.Item icon={<IconCircleX size={14} color="red" />}>
                  <b>{t('help.logs.faq.trBold')}</b>{t('help.logs.faq.tr')}
                </List.Item>
                <List.Item icon={<IconCircleX size={14} color="red" />}>
                  <b>{t('help.logs.faq.dlBold')}</b>{t('help.logs.faq.dl')}
                </List.Item>
              </List>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- 動作要件 ---- */}
        <Accordion.Item value="requirements">
          <Accordion.Control
            icon={
              <ThemeIcon color="lime" size={28} radius="xl" variant="light">
                <IconCircleCheck size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.req.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.req.envTitle')}</Text>
                <List size="sm" spacing={2}>
                  <List.Item>
                    <b>{t('help.req.osBold')}</b>{t('help.req.os')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.req.gpuBold')}</b>{t('help.req.gpu')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.req.ramBold')}</b>{t('help.req.ram')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.req.storageBold')}</b>{t('help.req.storage')}
                  </List.Item>
                </List>
              </Card>
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.req.vramTitle')}</Text>
                <List size="xs" spacing={2}>
                  <List.Item>
                    <b>{t('help.req.vram8Bold')}</b>{t('help.req.vram8')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.req.vram12Bold')}</b>{t('help.req.vram12')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.req.vram6Bold')}</b>{t('help.req.vram6')}
                  </List.Item>
                </List>
              </Card>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- ダウンロードエラーの対処 ---- */}
        <Accordion.Item value="download-errors">
          <Accordion.Control
            icon={
              <ThemeIcon color="orange" size={28} radius="xl" variant="light">
                <IconAlertTriangle size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.dl.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="sm">
                {t('help.dl.bodyPre')}<b>{t('help.dl.bodyBold')}</b>{t('help.dl.bodyPost')}
              </Text>

              <Alert variant="light" color="blue" icon={<IconBulb size={16} />}>
                <Text size="sm">
                  {t('help.dl.alertPre')}<b>{t('help.dl.alertBold')}</b>{t('help.dl.alertPost')}
                </Text>
              </Alert>

              {/* エラー種別と原因 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.dl.errorsTitle')}
                </Text>
                <Stack gap="xs">
                  <Box>
                    <Group gap="xs">
                      <Badge color="red" variant="light">404 Not Found</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.err404Title')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.err404Body')}
                    </Text>
                  </Box>
                  <Box>
                    <Group gap="xs">
                      <Badge color="orange" variant="light">410 Gone</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.err410Title')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.err410Body')}
                    </Text>
                  </Box>
                  <Box>
                    <Group gap="xs">
                      <Badge color="orange" variant="light">403 Forbidden</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.err403Title')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.err403Body')}
                    </Text>
                  </Box>
                  <Box>
                    <Group gap="xs">
                      <Badge color="yellow" variant="light">5xx</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.err5xxTitle')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.err5xxBody')}
                    </Text>
                  </Box>
                  <Box>
                    <Group gap="xs">
                      <Badge color="gray" variant="light">network</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.errNetTitle')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.errNetBody')}
                    </Text>
                  </Box>
                  <Box>
                    <Group gap="xs">
                      <Badge color="grape" variant="light">SHA256</Badge>
                      <Text size="sm" fw={500}>{t('help.dl.errShaTitle')}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {t('help.dl.errShaBody')}
                    </Text>
                  </Box>
                </Stack>
              </Card>

              {/* 各ソースの確認先 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.dl.sourcesTitle')}
                </Text>
                <Stack gap="xs">
                  <Box>
                    <Text size="xs" fw={600}>{t('help.dl.src.comfyTitle')}</Text>
                    <Anchor
                      size="xs"
                      onClick={() => openExternal('https://github.com/Comfy-Org/ComfyUI/releases/latest')}
                      style={{ cursor: 'pointer' }}
                    >
                      https://github.com/Comfy-Org/ComfyUI/releases/latest
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {t('help.dl.src.comfyNotePre')}<Code>comfyanonymous/ComfyUI</Code>{t('help.dl.src.comfyNoteMid')}<Code>ComfyUI_windows_portable_nvidia.7z</Code>{t('help.dl.src.comfyNotePost')}
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Text size="xs" fw={600}>{t('help.dl.src.llamaTitle')}</Text>
                    <Anchor
                      size="xs"
                      onClick={() => openExternal('https://github.com/ggml-org/llama.cpp/releases/latest')}
                      style={{ cursor: 'pointer' }}
                    >
                      https://github.com/ggml-org/llama.cpp/releases/latest
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {t('help.dl.src.llamaNotePre')}<Code>b9331</Code>{t('help.dl.src.llamaNotePost')}
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Text size="xs" fw={600}>{t('help.dl.src.qwenTitle')}</Text>
                    <Anchor
                      size="xs"
                      onClick={() => openExternal('https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main')}
                      style={{ cursor: 'pointer' }}
                    >
                      https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {t('help.dl.src.qwenNote')}
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Text size="xs" fw={600}>{t('help.dl.src.animaTitle')}</Text>
                    <Anchor
                      size="xs"
                      onClick={() => openExternal('https://huggingface.co/circlestone-labs/Anima/tree/main')}
                      style={{ cursor: 'pointer' }}
                    >
                      https://huggingface.co/circlestone-labs/Anima/tree/main
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {t('help.dl.src.animaNotePre')}<Code>split_files/</Code>{t('help.dl.src.animaNotePost')}
                    </Text>
                  </Box>
                </Stack>
              </Card>

              {/* URL 更新の手順 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.dl.howTitle')}
                </Text>
                <Text size="xs" c="dimmed" mb={6}>
                  {t('help.dl.howIntro')}
                </Text>
                <List size="xs" spacing={4}>
                  <List.Item>
                    <b>{t('help.dl.how.runtimeBold')}</b>{t('help.dl.how.runtimePre')}<Code>resources/runtime/runtime.json</Code>{t('help.dl.how.runtimeMid')}<Code>url</Code>{t('help.dl.how.runtimePost')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.dl.how.modelBold')}</b>: <Code>resources/models/&lt;model&gt;.json</Code>{t('help.dl.how.modelMid')}<Code>files</Code>{t('help.dl.how.modelPost')}<Code>url</Code>{t('help.dl.how.modelEnd')}
                  </List.Item>
                  <List.Item>
                    {t('help.dl.how.restart')}
                  </List.Item>
                </List>
              </Card>

              {/* 困ったとき */}
              <Alert variant="light" color="image-creator" icon={<IconBulb size={16} />}>
                <Text size="sm">
                  {t('help.dl.troubleHint')}
                </Text>
              </Alert>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- アンインストール ---- */}
        <Accordion.Item value="uninstall">
          <Accordion.Control
            icon={
              <ThemeIcon color="red" size={28} radius="xl" variant="light">
                <IconTrash size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.un.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="sm">{t('help.un.intro')}</Text>

              {/* 基本手順 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.un.basicTitle')}
                </Text>
                <List
                  spacing="sm"
                  size="sm"
                  icon={
                    <ThemeIcon color="image-creator" size={22} radius="xl" variant="light">
                      <IconCircleNumber1 size={12} />
                    </ThemeIcon>
                  }
                >
                  <List.Item
                    icon={
                      <ThemeIcon color="image-creator" size={22} radius="xl">
                        <IconCircleNumber1 size={12} />
                      </ThemeIcon>
                    }
                  >
                    {t('help.un.step1.pre')}<b>{t('help.un.step1.bold')}</b>{t('help.un.step1.mid')}<Code>Win + I</Code>{t('help.un.step1.post')}
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon color="image-creator" size={22} radius="xl">
                        <IconCircleNumber2 size={12} />
                      </ThemeIcon>
                    }
                  >
                    <b>{t('help.un.step2.bold1')}</b>{t('help.un.step2.middle')}<b>{t('help.un.step2.bold2')}</b>{t('help.un.step2.tail')}
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon color="image-creator" size={22} radius="xl">
                        <IconCircleNumber3 size={12} />
                      </ThemeIcon>
                    }
                  >
                    {t('help.un.step3.pre')}<b>{t('help.un.step3.bold')}</b>{t('help.un.step3.post')}
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon color="image-creator" size={22} radius="xl">
                        <IconCircleNumber4 size={12} />
                      </ThemeIcon>
                    }
                  >
                    {t('help.un.step4.pre')}<Code>…</Code>{t('help.un.step4.mid')}<b>{t('help.un.step4.bold')}</b>{t('help.un.step4.post')}
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon color="image-creator" size={22} radius="xl">
                        <IconCircleNumber5 size={12} />
                      </ThemeIcon>
                    }
                  >
                    {t('help.un.step5')}
                  </List.Item>
                </List>
              </Card>

              {/* チェックボックスの選択 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.un.checkboxTitle')}
                </Text>
                <Text size="xs" c="dimmed" mb="sm">
                  {t('help.un.checkboxIntro')}
                </Text>
                <Stack gap="sm">
                  <Box>
                    <Group gap="xs" mb={4}>
                      <Badge color="red" variant="light">{t('help.un.checkbox.onBadge')}</Badge>
                      <Text size="sm" fw={500}>
                        {t('help.un.checkbox.onTitle')}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('help.un.checkbox.onBodyPre')}<Code>%LOCALAPPDATA%\ImageCreator</Code>{t('help.un.checkbox.onBodyPost')}
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Group gap="xs" mb={4}>
                      <Badge color="gray" variant="light">{t('help.un.checkbox.offBadge')}</Badge>
                      <Text size="sm" fw={500}>
                        {t('help.un.checkbox.offTitle')}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('help.un.checkbox.offBody')}
                    </Text>
                  </Box>
                </Stack>
              </Card>

              {/* 削除対象と保持データ */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.un.tableTitle')}
                </Text>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xs">
                  <Card padding="xs" radius="sm" withBorder>
                    <Group gap="xs" mb={4}>
                      <IconCircleX size={14} color="red" />
                      <Text size="xs" fw={600}>{t('help.un.alwaysDelete')}</Text>
                    </Group>
                    <List size="xs" spacing={2}>
                      <List.Item>
                        {t('help.un.alwaysDelete.appPre')}<Code>C:\Program Files\ImageCreator</Code>
                      </List.Item>
                      <List.Item>{t('help.un.alwaysDelete.shortcut')}</List.Item>
                      <List.Item>{t('help.un.alwaysDelete.registry')}</List.Item>
                    </List>
                  </Card>
                  <Card padding="xs" radius="sm" withBorder>
                    <Group gap="xs" mb={4}>
                      <IconArchive size={14} color="orange" />
                      <Text size="xs" fw={600}>{t('help.un.checkboxDelete')}</Text>
                    </Group>
                    <List size="xs" spacing={2}>
                      <List.Item>{t('help.un.del.settings')}<Code>settings.json</Code></List.Item>
                      <List.Item>{t('help.un.del.gallery')}<Code>gallery.db</Code></List.Item>
                      <List.Item>{t('help.un.del.log')}<Code>logs/app.log</Code></List.Item>
                      <List.Item>{t('help.un.del.models')}</List.Item>
                      <List.Item>{t('help.un.del.comfy')}</List.Item>
                      <List.Item>{t('help.un.del.llama')}</List.Item>
                      <List.Item>{t('help.un.del.qwen')}</List.Item>
                      <List.Item>{t('help.un.del.images')}</List.Item>
                    </List>
                  </Card>
                  <Card padding="xs" radius="sm" withBorder>
                    <Group gap="xs" mb={4}>
                      <IconCircleCheck size={14} color="green" />
                      <Text size="xs" fw={600}>{t('help.un.alwaysKeep')}</Text>
                    </Group>
                    <List size="xs" spacing={2}>
                      <List.Item>{t('help.un.alwaysKeep.win')}</List.Item>
                      <List.Item>{t('help.un.alwaysKeep.driver')}</List.Item>
                      <List.Item>{t('help.un.alwaysKeep.userCopy')}</List.Item>
                    </List>
                  </Card>
                </SimpleGrid>
              </Card>

              {/* バックアップ推奨 */}
              <Alert
                variant="light"
                color="yellow"
                icon={<IconAlertTriangle size={16} />}
                title={t('help.un.backupTitle')}
              >
                <Stack gap="xs">
                  <Text size="sm">
                    {t('help.un.backupBodyPre')}<b>{t('help.un.backupBodyBold')}</b>{t('help.un.backupBodyPost')}
                  </Text>
                  <List size="xs" spacing={2}>
                    <List.Item>
                      <b>{t('help.un.backup.locBold')}</b>: <Code>&lt;data folder&gt;\gallery\full\</Code>
                    </List.Item>
                    <List.Item>
                      <b>{t('help.un.backup.fmtBold')}</b>{t('help.un.backup.fmt')}
                    </List.Item>
                    <List.Item>
                      <b>{t('help.un.backup.howBold')}</b>{t('help.un.backup.how')}
                    </List.Item>
                    <List.Item>
                      <b>{t('help.un.backup.singleBold')}</b>{t('help.un.backup.single')}
                    </List.Item>
                  </List>
                </Stack>
              </Alert>

              {/* 手動完全削除 */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.un.manualTitle')}
                </Text>
                <Text size="xs" c="dimmed" mb={6}>
                  {t('help.un.manualIntro')}
                </Text>
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>{t('help.un.manual.appBold')}</b>: <Code>C:\Program Files\ImageCreator</Code>{t('help.un.manual.appPost')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.un.manual.userBold')}</b>: <Code>%LOCALAPPDATA%\ImageCreator</Code>{t('help.un.manual.userPost')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.un.manual.dataBold')}</b>{t('help.un.manual.data')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.un.manual.regBold')}</b>{t('help.un.manual.regPre')}<Code>regedit</Code>{t('help.un.manual.regMid')}<Code>HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\</Code>{t('help.un.manual.regPost')}
                  </List.Item>
                </List>

                <Text size="xs" c="dimmed" mt="sm" mb={4}>
                  {t('help.un.psExample')}
                </Text>
                <Card padding="xs" radius="sm" withBorder bg="rgba(0,0,0,0.2)">
                  <Text
                    size="xs"
                    style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                  >
                    {`# User data
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\\ImageCreator"

# Data folder (adjust path as needed)
Remove-Item -Recurse -Force "D:\\ImageCreator\\data"`}
                  </Text>
                </Card>
                <Alert variant="light" color="red" mt="xs" p="xs">
                  <Text size="xs">
                    {t('help.un.psWarnPre')}<Code>Remove-Item -Recurse -Force</Code>{t('help.un.psWarnPost')}
                  </Text>
                </Alert>
              </Card>

              {/* 再インストール */}
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={600} mb={6}>
                  {t('help.un.reinstallTitle')}
                </Text>
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>{t('help.un.reinstall.userBold')}</b>{t('help.un.reinstall.userPost')}
                  </List.Item>
                  <List.Item>
                    <b>{t('help.un.reinstall.dataBold')}</b>{t('help.un.reinstall.dataPost')}
                  </List.Item>
                </List>
              </Card>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- ライセンスと注意 ---- */}
        <Accordion.Item value="license">
          <Accordion.Control
            icon={
              <ThemeIcon color="red" size={28} radius="xl" variant="light">
                <IconAlertTriangle size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.license.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Alert
                variant="light"
                color="yellow"
                icon={<IconAlertTriangle size={16} />}
                title={t('help.license.alertTitle')}
              >
                <Text size="sm">
                  {t('help.license.alertPre')}<b>{t('help.license.alertBold')}</b>{t('help.license.alertPost')}
                </Text>
              </Alert>
              <Card padding="sm" radius="sm" withBorder>
                <Text size="sm" fw={500} mb={6}>{t('help.license.compTitle')}</Text>
                <List size="xs" spacing={2}>
                  <List.Item>
                    <b>ImageCreator</b>{t('help.license.compApp')}
                  </List.Item>
                  <List.Item>
                    <b>Anima</b>{t('help.license.compAnima')}
                  </List.Item>
                  <List.Item>
                    <b>ComfyUI</b>{t('help.license.compComfy')}
                  </List.Item>
                  <List.Item>
                    <b>llama.cpp</b>{t('help.license.compLlama')}
                  </List.Item>
                  <List.Item>
                    <b>Qwen2.5</b>{t('help.license.compQwen')}
                  </List.Item>
                </List>
              </Card>
              <Text size="xs" c="dimmed">
                {t('help.license.footnote')}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ---- 外部リンク ---- */}
        <Accordion.Item value="links">
          <Accordion.Control
            icon={
              <ThemeIcon color="violet" size={28} radius="xl" variant="light">
                <IconExternalLink size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={600}>{t('help.links.title')}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <ExternalLinkRow
                label={t('help.links.anima')}
                url="https://huggingface.co/circlestone-labs/Anima"
                onClick={openExternal}
              />
              <ExternalLinkRow
                label={t('help.links.comfy')}
                url="https://github.com/Comfy-Org/ComfyUI"
                onClick={openExternal}
              />
              <ExternalLinkRow
                label={t('help.links.llama')}
                url="https://github.com/ggml-org/llama.cpp"
                onClick={openExternal}
              />
              <ExternalLinkRow
                label={t('help.links.qwen')}
                url="https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF"
                onClick={openExternal}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {/* フッター */}
      <Card withBorder padding="md" radius="md" mt="md">
        <Group justify="space-between" wrap="wrap">
          <Stack gap={2}>
            <Text size="sm" fw={500}>{t('app.title')}</Text>
            <Text size="xs" c="dimmed">
              {t('help.footer.tagline')}
            </Text>
          </Stack>
          <Text size="xs" c="dimmed">
            {t('help.footer.note')}
          </Text>
        </Group>
      </Card>
    </Stack>
  );
}

function ExternalLinkRow({
  label,
  url,
  onClick,
}: {
  label: string;
  url: string;
  onClick: (url: string) => void;
}) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Anchor
        size="sm"
        onClick={() => onClick(url)}
        style={{ cursor: 'pointer', flex: 1 }}
      >
        {label}
      </Anchor>
      <Group gap={4}>
        <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
          {url}
        </Text>
        <IconExternalLink size={12} />
      </Group>
    </Group>
  );
}
