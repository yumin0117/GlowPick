import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from evaluate import compare,validate

def response(items,status='complete'):
    return dict(status=status,rawText=', '.join(items),ingredients=items,uncertainSpans=[],warnings=[],nextAction='전성분 확대 촬영')

class EvaluationTests(unittest.TestCase):
    def test_missing_extra_duplicate_order(self):
        gold={'ingredients':['A','B','C'],'raw_text':'A, B, C'}
        r=compare(gold,response(['C','A','A','D']))
        self.assertEqual(r['missing'],['b']);self.assertEqual(r['extra'],['a','d'])
        self.assertTrue(r['order_error']);self.assertFalse(r['pass_all'])
    def test_empty_output_not_perfect(self):
        r=compare({'ingredients':['A'],'raw_text':'A'},response([],'unreadable'))
        self.assertEqual(r['recall'],0);self.assertIsNone(r['precision']);self.assertEqual(r['cer'],1)
    def test_wrong_types_rejected(self):
        for bad in [None,[],{},dict(response(['A']),ingredients=7),dict(response(['A']),uncertainSpans='x')]:
            with self.assertRaises(ValueError):validate(bad)
    def test_partial_not_pass(self):
        r=compare({'ingredients':['A'],'raw_text':'A'},response(['A'],'partial'))
        self.assertEqual(r['recall'],1);self.assertFalse(r['pass_all'])
    def test_numeric_comma_and_slash_preserved(self):
        a=['1,2-Hexanediol','Aqua/Water']
        self.assertTrue(compare({'ingredients':a,'raw_text':', '.join(a)},response(a))['pass_all'])
    def test_no_alias_repair(self):
        self.assertFalse(compare({'ingredients':['Squalane'],'raw_text':'Squalane'},response(['Squalene']))['pass_all'])
    def test_missing_gold_not_scored(self):
        with self.assertRaises(ValueError):compare({'ingredients':[],'raw_text':''},response([],'no_ingredients'))
    def test_next_action_must_be_text(self):
        for value in [None,42,'']:
            with self.assertRaises(ValueError):validate(dict(response([],'unreadable'),nextAction=value))

if __name__=='__main__':unittest.main()
