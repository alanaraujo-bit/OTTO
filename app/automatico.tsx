import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { OttoCapture } from '../modules/otto-capture';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Latch } from '@/ui/Latch';
import { ChevronRight } from '@/ui/Icon';
import { useSnackbar } from '@/ui/Snackbar';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useCapture } from '@/state/capture';
import { BANK_APPS } from '@/domain/capture';

const ENTER = { delay: 160, step: 70, cap: 6, rise: 10, shift: 26 } as const;
const BANKS = [...new Set(Object.values(BANK_APPS))];

/**
 * Lançamento automático: the three ways OTTO records for you, and the one switch that needs the
 * system's permission.
 *
 * Reading another app's notifications is a large thing to ask, so the screen says exactly what is
 * read (only bank apps), where (on this phone, nowhere else) and what comes of it (a suggestion that
 * waits for your yes) before it sends the owner to the system's own switch — and it notices when
 * they come back with it on.
 */
export default function Automatico() {
  return (
    <Screen>
      <Body />
    </Screen>
  );
}

function Body() {
  const snack = useSnackbar();
  const listening = useCapture((s) => s.listening);
  const supported = useCapture((s) => s.supported);
  const refresh = useCapture((s) => s.refresh);
  const [announce, setAnnounce] = useState(OttoCapture?.announces() ?? true);

  // Coming back from the system screen is the moment to notice the switch was turned on.
  useEffect(() => {
    let was = useCapture.getState().listening;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      refresh();
      const now = useCapture.getState().listening;
      if (now && !was) snack('Pronto. O OTTO já está lendo as notificações do seu banco.', 'info');
      was = now;
    });
    refresh();
    return () => sub.remove();
  }, [refresh, snack]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackBar onPress={() => router.back()} />
      <Reveal index={0} {...ENTER}>
        <View style={styles.heading}>
          <Txt variant="title" f="sansSemibold">
            Lançamento automático
          </Txt>
          <Txt variant="body" t="muted" style={styles.intro}>
            O OTTO lê o que seu banco já te contou e deixa o lançamento pronto. Você só confirma.
          </Txt>
        </View>
      </Reveal>

      <Reveal index={1} {...ENTER} rise={0}>
        <Section label="notificações do banco" />
        {!supported ? (
          <Txt variant="body" t="muted" style={styles.block}>
            Este aparelho não permite ler notificações. Comprovantes e notas fiscais continuam funcionando.
          </Txt>
        ) : (
          <>
            <View style={styles.status}>
              <View style={[styles.dot, listening ? styles.dotOn : null]} />
              <Txt variant="body" f="sansMedium">
                {listening ? 'Ligado' : 'Desligado'}
              </Txt>
            </View>
            <Txt variant="body" t="muted" style={styles.blockTight}>
              {listening
                ? 'Toda compra no cartão e todo Pix que seu banco avisar viram um lançamento esperando a sua confirmação.'
                : 'Toque abaixo, ative o OTTO na lista do Android e volte aqui. Leva dez segundos.'}
            </Txt>
            {!listening ? (
              <View style={styles.cta}>
                <Button label="Permitir leitura das notificações" onPress={() => OttoCapture?.openListenerSettings()} />
              </View>
            ) : null}

            <View style={styles.promise}>
              <Txt variant="micro" f="sansMedium" t="muted">
                O QUE O OTTO PROMETE
              </Txt>
              <Txt variant="micro" t="faint" style={styles.promiseLine}>
                Só lê notificações de apps de banco. As outras nem são abertas.
              </Txt>
              <Txt variant="micro" t="faint" style={styles.promiseLine}>
                Tudo acontece no seu celular. O texto da notificação não sai daqui.
              </Txt>
              <Txt variant="micro" t="faint" style={styles.promiseLine}>
                Nada entra no razão sem o seu toque em Lançar.
              </Txt>
            </View>

            {!listening ? (
              <View style={styles.help}>
                <Txt variant="micro" t="faint">
                  O Android disse “configuração restrita”? Acontece com apps instalados fora da Play Store. Abra
                  as informações do app, toque nos três pontos e em “Permitir configurações restritas”, e tente de
                  novo.
                </Txt>
                <Press onPress={() => OttoCapture?.openAppDetails()} style={styles.textAction} accessibilityLabel="Abrir informações do app">
                  <Txt variant="label" t="muted">
                    Abrir informações do app
                  </Txt>
                </Press>
              </View>
            ) : null}

            <Press
              onPress={() => {
                const next = !announce;
                setAnnounce(next);
                OttoCapture?.setAnnounce(next);
              }}
              haptic="light"
              scale={0.995}
              style={styles.row}
              accessibilityLabel="Avisar quando detectar"
              accessibilityState={{ selected: announce }}
            >
              <View style={styles.rowText}>
                <Txt variant="body">Avisar quando detectar</Txt>
                <Txt variant="micro" t="faint">
                  Uma notificação com o botão Lançar, para confirmar sem abrir o app.
                </Txt>
              </View>
              <Latch on={announce} />
            </Press>

            <Txt variant="micro" t="faint" style={styles.banks}>
              {`Entende: ${BANKS.join(', ')}.`}
            </Txt>
          </>
        )}
      </Reveal>

      <Reveal index={2} {...ENTER} rise={0}>
        <Section label="comprovantes" />
        <Txt variant="body" t="muted" style={styles.block}>
          No comprovante de um Pix, num print ou num PDF, toque em Compartilhar e escolha o OTTO. Ele lê o valor e
          quem recebeu, no próprio celular, e deixa pronto para lançar.
        </Txt>
      </Reveal>

      <Reveal index={3} {...ENTER} rise={0}>
        <Section label="nota fiscal" />
        <Press onPress={() => router.push('/nota')} style={styles.row} accessibilityLabel="Ler nota fiscal">
          <View style={styles.rowText}>
            <Txt variant="body">Ler nota fiscal</Txt>
            <Txt variant="micro" t="faint">
              Aponte para o QR do cupom: loja, total e hora, direto da Sefaz.
            </Txt>
          </View>
          <ChevronRight tint={color.inkFaint} />
        </Press>
      </Reveal>
    </ScrollView>
  );
}

function Section({ label }: { label: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxxl },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },
  section: { paddingTop: space.xxl },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionLabel: { letterSpacing: 0.8, paddingTop: space.md },
  block: { paddingTop: space.md },
  blockTight: { paddingTop: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.inkFaint },
  dotOn: { backgroundColor: color.ink },
  cta: { paddingTop: space.lg },
  promise: { paddingTop: space.xl },
  promiseLine: { paddingTop: space.xs },
  help: { paddingTop: space.lg },
  textAction: { paddingTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, marginTop: space.lg },
  rowText: { flex: 1, paddingRight: space.lg },
  banks: { paddingTop: space.sm },
});
