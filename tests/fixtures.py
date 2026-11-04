"""Explicit test transports. Never used by the normal launcher; every answer is marked as fixture."""
import json
import pathlib
import sys

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from test_recorte1 import ClientFixture
from office.provider import OperationError

CHANNELS=['instagram-feed','instagram-stories','linkedin-feed']


class ContentFixture(ClientFixture):
    """Answers the card-job schemas from the material in the prompt. No creativity, no real AI."""
    def generate(self,system,prompt,*,schema=None,max_tokens=0):
        props=schema.get('properties',{}) if schema else {}
        if schema and 'decision' in props and 'tasks' not in props:
            self.calls.append({'system':system,'prompt':prompt,'schema':schema});self.entered.set()
            if self.gate:self.gate.wait(2)
            if len(self.calls)==self.fail_at:raise OperationError('Limite de teste.','rate_limit',429)
            data=json.JSONDecoder().raw_decode(prompt)[0]
            result={'decision':'execute','title':'Semana de teste','summary':'Pauta de teste conduzida pela fixture.','questions':[],'acceptance_criteria':['Três posts específicos ao cliente.']}
            if self.clarify and not data['esclarecimentos']:result.update(decision='clarify',questions=['Qual é o foco desta semana?'])
            return self._wrap(json.dumps(result,ensure_ascii=False))
        if schema and 'posts' in props:
            self.calls.append({'system':system,'prompt':prompt,'schema':schema})
            if len(self.calls)==self.fail_at:raise OperationError('Limite de teste.','rate_limit',429)
            data=json.JSONDecoder().raw_decode(prompt)[0];client=(data.get('cliente') or {}).get('cliente','cliente')
            posts=[{'title':f'Post {i} de teste para {client}','theme':f'Tema {i}','angle':f'Ângulo {i} ligado a {client}','channel_focus':'ambos','key_message':f'Mensagem {i}'} for i in (1,2,3)]
            return self._wrap(json.dumps({'posts':posts},ensure_ascii=False))
        if schema and 'pieces' in props:
            self.calls.append({'system':system,'prompt':prompt,'schema':schema})
            if len(self.calls)==self.fail_at:raise OperationError('Limite de teste.','rate_limit',429)
            data=json.JSONDecoder().raw_decode(prompt)[0];title=data['pauta_do_post']['title'];adjust=data.get('ajuste_pedido','')
            pieces=[{'channel':c,'headline':f'{title} · {c}'+(' · AJUSTADO' if adjust else ''),'text':f'TEXTO DE TESTE para {title} em {c}.'+(f' Ajuste: {adjust}' if adjust else ''),'caption':f'Legenda de teste {c}','visual_direction':f'Direção de teste {c}','image_prompt':f'test prompt {c}'} for c in CHANNELS]
            return self._wrap(json.dumps({'pieces':pieces},ensure_ascii=False))
        if schema and 'cards' in props:
            self.calls.append({'system':system,'prompt':prompt,'schema':schema})
            if len(self.calls)==self.fail_at:raise OperationError('Limite de teste.','rate_limit',429)
            return self._wrap(json.dumps({'cards':[{'ordinal':i,'ok':i!=2,'notes':'Revisão de teste.' if i!=2 else 'Falta prova no post 2.'} for i in (1,2,3)]}))
        return super().generate(system,prompt,schema=schema,max_tokens=max_tokens)
    def _wrap(self,text):
        return {'text':text,'model':'fixture-no-real-ai','usage':{'input_tokens':31,'output_tokens':19},'request_id':'fixture-'+str(len(self.calls))}
