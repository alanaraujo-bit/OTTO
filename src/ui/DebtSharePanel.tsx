import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import type { Series } from '@/domain/model';
import { color, space } from '@/theme/tokens';
import { Txt } from '@/theme/text';
import { useSnackbar } from './Snackbar';
import { Button } from './Button';
import { Field } from './Field';
import { Press } from './Press';
import {
  debtShareUrl,
  getDebtShare,
  revokeDebtShare,
  shareDebt,
  type DebtShareSummary,
} from '@/lib/debtShare';

/**
 * Sharing is deliberately a passage in the ledger, not a social-feature card. The URL is the
 * capability: long, unguessable, and revocable from exactly where it was created.
 */
export function DebtSharePanel({ series }: { series: Series }) {
  const snack = useSnackbar();
  const [share, setShare] = useState<DebtShareSummary | null>(null);
  const [recipientName, setRecipientName] = useState(series.counterparty ?? '');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadShare = () => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    void getDebtShare(series.id)
      .then((value) => {
        if (!alive) return;
        setShare(value);
        if (value?.recipientName) setRecipientName(value.recipientName);
      })
      .catch((error) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : 'Não consegui consultar o compartilhamento.');
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  };

  useEffect(() => {
    return loadShare();
    // Reload only when the edited debt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id]);

  const send = async (current: DebtShareSummary) => {
    const url = debtShareUrl(current.token);
    const verb = series.direction === 'out' ? 'devo' : 'tenho para receber';
    const message = `Acompanhe no OTTO a dívida que eu ${verb}: ${url}`;
    if (Platform.OS === 'web' && globalThis.navigator?.clipboard) {
      await globalThis.navigator.clipboard.writeText(url);
      snack('Link copiado.', 'info');
      return;
    }
    await Share.share({ title: `Dívida com ${current.recipientName}`, message, url });
  };

  const createAndSend = async () => {
    if (!recipientName.trim() || working) return;
    setWorking(true);
    try {
      const current = await shareDebt(series.id, recipientName.trim());
      setShare(current);
      await send(current);
    } catch (error) {
      snack(error instanceof Error ? error.message : 'Não consegui compartilhar.', 'error');
    } finally {
      setWorking(false);
    }
  };

  const stop = async () => {
    if (working) return;
    setWorking(true);
    try {
      await revokeDebtShare(series.id);
      setShare(null);
      snack('O link deixou de mostrar esta dívida.', 'info');
    } catch (error) {
      snack(error instanceof Error ? error.message : 'Não consegui revogar o link.', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.rule} />
      <View style={styles.heading}>
        <Txt variant="heading" f="sansSemibold">Acompanhar juntos</Txt>
        {share ? (
          <Txt variant="micro" t={share.acceptedAt ? 'positive' : 'warning'} f="sansMedium">
            {share.acceptedAt ? 'CONECTADO' : 'LINK ATIVO'}
          </Txt>
        ) : null}
      </View>
      <Txt variant="body" t="muted" style={styles.copy}>
        {share
          ? `${share.recipientName} vê o mesmo progresso, sem precisar criar uma conta.`
          : 'Envie um link privado. A pessoa acompanha cada parcela no app ou pelo navegador.'}
      </Txt>

      {loadError ? (
        <View style={styles.action}>
          <Txt variant="label" t="warning">{loadError}</Txt>
          <View style={styles.retryAction}>
            <Button label="Tentar novamente" onPress={loadShare} variant="outline" />
          </View>
        </View>
      ) : !share ? (
        <>
          <Field
            label="Compartilhar com"
            value={recipientName}
            onChangeText={setRecipientName}
            autoCapitalize="words"
            maxLength={80}
            placeholder="Nome da pessoa"
          />
          <View style={styles.action}>
            <Button
              label="Criar link e compartilhar"
              onPress={() => void createAndSend()}
              disabled={!recipientName.trim() || loading || working}
              loading={working}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.action}>
            <Button
              label="Compartilhar novamente"
              onPress={() => void send(share)}
              disabled={working}
              variant="outline"
            />
          </View>
          <Press onPress={() => void stop()} disabled={working} style={styles.revoke}>
            <Txt variant="label" t="faint" center>Revogar acesso</Txt>
          </Press>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xxl },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },
  heading: {
    paddingTop: space.lg,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  copy: { paddingTop: space.sm },
  action: { paddingTop: space.lg },
  retryAction: { paddingTop: space.md },
  revoke: { marginTop: space.sm },
});
