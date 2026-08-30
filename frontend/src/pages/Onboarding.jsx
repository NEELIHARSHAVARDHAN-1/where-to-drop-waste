import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, MapPin, Users, Brain, ArrowRight, Check } from 'lucide-react'
import clsx from 'clsx'

const QUIZ_QUESTIONS = [
  {
    q: 'Where should a clean, empty plastic bottle go?',
    options: ['Wet/Organic bin', 'Dry/Recyclable bin', 'General waste', 'E-waste'],
    correct: 1,
    explanation: 'Clean plastic bottles (#1 PET) are recyclable in most areas.',
  },
  {
    q: 'What should you do with a pizza box?',
    options: ['Recycle the whole box', 'Only recycle the clean top, compost the greasy bottom', 'Put in organic waste', 'Put in general waste'],
    correct: 1,
    explanation: 'Grease contaminates paper recycling. Split clean parts from contaminated parts.',
  },
  {
    q: 'Where do old batteries go?',
    options: ['General waste bin', 'Paper recycling', 'E-waste/Battery drop-off', 'Organic waste'],
    correct: 2,
    explanation: 'Batteries contain toxic chemicals. Always take to designated battery drop-off points.',
  },
  {
    q: 'Which bin is used for vegetable peels and food scraps?',
    options: ['Blue/Dry bin', 'Green/Wet or Organic bin', 'Red/Hazardous bin', 'Yellow/E-waste bin'],
    correct: 1,
    explanation: 'Organic waste goes in the green/wet bin for composting.',
  },
  {
    q: 'What does "recyclable conditionally" mean?',
    options: ['Always recyclable', 'Never recyclable', 'Recyclable only if clean, in right condition, or by local rules', 'Needs special handling'],
    correct: 2,
    explanation: 'Conditional recyclability depends on cleanliness, local infrastructure, and material state.',
  },
]

const STEPS = ['Location', 'Usage Type', 'Quiz', 'Results']

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [location, setLocation] = useState({ country: 'India', state: '', city: '' })
  const [userType, setUserType] = useState('')
  const [quizAnswers, setQuizAnswers] = useState({})
  const [currentQ, setCurrentQ] = useState(0)
  const [score, setScore] = useState(0)

  const handleAnswer = (answerIdx) => {
    if (quizAnswers[currentQ] !== undefined) return
    setQuizAnswers(prev => ({ ...prev, [currentQ]: answerIdx }))
    if (answerIdx === QUIZ_QUESTIONS[currentQ].correct) {
      setScore(s => s + 1)
    }
  }

  const nextQuestion = () => {
    if (currentQ < QUIZ_QUESTIONS.length - 1) {
      setCurrentQ(q => q + 1)
    } else {
      setStep(3)
    }
  }

  const getScoreLevel = () => {
    if (score >= 4) return { label: 'Recycling Expert!', color: 'text-eco-600', icon: '🏆' }
    if (score >= 3) return { label: 'Good Recycler', color: 'text-blue-600', icon: '🌟' }
    if (score >= 2) return { label: 'Learning Recycler', color: 'text-amber-600', icon: '🌱' }
    return { label: 'Recycling Beginner', color: 'text-gray-600', icon: '📚' }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-eco-50 to-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-eco-100 p-3 rounded-2xl">
              <Leaf className="w-8 h-8 text-eco-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to WasteWise</h1>
          <p className="text-gray-500">Let's personalize your recycling experience</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                i < step ? 'bg-eco-500 text-white' : i === step ? 'bg-eco-100 text-eco-700 border-2 border-eco-500' : 'bg-gray-100 text-gray-400'
              )}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={clsx('flex-1 h-1 mx-1 rounded', i < step ? 'bg-eco-500' : 'bg-gray-200')} />}
            </div>
          ))}
        </div>

        <div className="card">
          {/* Step 0: Location */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-eco-600" />
                <h2 className="text-lg font-bold text-gray-900">Where are you located?</h2>
              </div>
              <p className="text-sm text-gray-600">This helps us show recycling rules relevant to your area.</p>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Country</label>
                <select className="input" value={location.country} onChange={e => setLocation(l => ({ ...l, country: e.target.value }))}>
                  {['India', 'USA', 'UK', 'Germany', 'Australia', 'Canada'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">State (optional)</label>
                  <input className="input" placeholder="e.g. Maharashtra" value={location.state} onChange={e => setLocation(l => ({ ...l, state: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">City (optional)</label>
                  <input className="input" placeholder="e.g. Mumbai" value={location.city} onChange={e => setLocation(l => ({ ...l, city: e.target.value }))} />
                </div>
              </div>
              <button onClick={() => setStep(1)} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Usage type */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-eco-600" />
                <h2 className="text-lg font-bold text-gray-900">How will you use WasteWise?</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'household', label: 'Household', icon: '🏠', desc: 'For home use' },
                  { id: 'school', label: 'School', icon: '🏫', desc: 'Students & teachers' },
                  { id: 'office', label: 'Office', icon: '🏢', desc: 'Workplace recycling' },
                  { id: 'community', label: 'Community', icon: '🤝', desc: 'Neighborhood groups' },
                ].map(({ id, label, icon, desc }) => (
                  <button key={id} onClick={() => setUserType(id)}
                    className={clsx('p-4 rounded-xl border-2 text-left transition-all',
                      userType === id ? 'border-eco-500 bg-eco-50' : 'border-gray-200 hover:border-eco-300'
                    )}>
                    <div className="text-2xl mb-1">{icon}</div>
                    <div className="font-semibold text-gray-900">{label}</div>
                    <div className="text-xs text-gray-500">{desc}</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1">Back</button>
                <button onClick={() => setStep(2)} disabled={!userType} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Quiz */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-5 h-5 text-eco-600" />
                <h2 className="text-lg font-bold text-gray-900">Recycling Quiz</h2>
                <span className="ml-auto text-sm text-gray-500">{currentQ + 1}/{QUIZ_QUESTIONS.length}</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-eco-500 h-1.5 rounded-full transition-all" style={{ width: `${((currentQ + 1) / QUIZ_QUESTIONS.length) * 100}%` }} />
              </div>

              <p className="font-semibold text-gray-900">{QUIZ_QUESTIONS[currentQ].q}</p>

              <div className="space-y-2">
                {QUIZ_QUESTIONS[currentQ].options.map((opt, i) => {
                  const answered = quizAnswers[currentQ] !== undefined
                  const isSelected = quizAnswers[currentQ] === i
                  const isCorrect = i === QUIZ_QUESTIONS[currentQ].correct
                  return (
                    <button key={i} onClick={() => handleAnswer(i)} disabled={answered}
                      className={clsx('w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors',
                        !answered ? 'border-gray-200 hover:border-eco-400 hover:bg-eco-50' :
                        isCorrect ? 'border-eco-500 bg-eco-50 text-eco-800' :
                        isSelected ? 'border-red-400 bg-red-50 text-red-800' :
                        'border-gray-200 bg-gray-50 text-gray-500'
                      )}>
                      {opt}
                      {answered && isCorrect && ' ✅'}
                      {answered && isSelected && !isCorrect && ' ❌'}
                    </button>
                  )
                })}
              </div>

              {quizAnswers[currentQ] !== undefined && (
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                  💡 {QUIZ_QUESTIONS[currentQ].explanation}
                </div>
              )}

              {quizAnswers[currentQ] !== undefined && (
                <button onClick={nextQuestion} className="btn-primary w-full flex items-center justify-center gap-2">
                  {currentQ < QUIZ_QUESTIONS.length - 1 ? 'Next Question' : 'See Results'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === 3 && (() => {
            const lvl = getScoreLevel()
            return (
              <div className="text-center space-y-4">
                <div className="text-5xl mb-2">{lvl.icon}</div>
                <h2 className="text-xl font-bold text-gray-900">Your Recycling Score</h2>
                <div className={clsx('text-4xl font-bold', lvl.color)}>{score}/{QUIZ_QUESTIONS.length}</div>
                <div className={clsx('text-lg font-semibold', lvl.color)}>{lvl.label}</div>
                <p className="text-gray-600 text-sm">
                  {score >= 4
                    ? 'Excellent! You know your recycling rules well. WasteWise will help you track and improve even further.'
                    : score >= 2
                    ? 'Good start! WasteWise will help you learn the rules and improve your recycling habits.'
                    : 'Don\'t worry — WasteWise will guide you every step of the way!'
                  }
                </p>
                <div className="pt-2 space-y-2">
                  <button onClick={() => navigate('/classify')} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    Start Classifying Waste <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => navigate('/register')} className="btn-secondary w-full py-2.5">
                    Create Account to Track Progress
                  </button>
                </div>
              </div>
            )
          })()}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account? <a href="/login" className="text-eco-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}
